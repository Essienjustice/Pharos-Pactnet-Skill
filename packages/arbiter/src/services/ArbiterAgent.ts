import Anthropic from "@anthropic-ai/sdk";
import type {
  ArbiterVerdict,
  EvidenceBundle,
  EvidenceItem,
  Pact,
  ParsedCommitment
} from "@pactnet/shared";
import {
  ArbiterVerdictSchema,
  DETERMINISTIC_ARBITER_MODE,
  ParsedCommitmentSchema
} from "@pactnet/shared";
import { ethers } from "ethers";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const PARSE_SYSTEM_PROMPT =
  "You are PactNet's commitment parser. Given a natural-language commitment made by an AI agent, extract a structured JSON object. Return ONLY valid JSON with these exact fields: action (string - what the agent must do), successCondition (string - exact verifiable condition), evidenceTypes (array of: onchain_tx | api_response | ipfs_content | zk_proof | oracle_data), deadline (number - unix timestamp from context), bondAmountWei (string), confidenceInParse (number 0-100). No markdown, no explanation, only the JSON object.";

const EVALUATE_SYSTEM_PROMPT =
  "You are PactNet's impartial outcome arbiter. Given a pact's commitment text, its parsed success condition, the deadline, and submitted evidence, determine whether the agent fulfilled their commitment. Be strict and precise. Return ONLY valid JSON: { fulfilled: boolean, confidence: number (0-100), reasoning: string (2-4 sentences, factual), evidenceSummary: string (1 sentence) }. No markdown.";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type EvaluationResponse = {
  fulfilled: boolean;
  confidence: number;
  reasoning: string;
  evidenceSummary: string;
};

const ALLOWED_EVIDENCE_TYPES = [
  "onchain_tx",
  "api_response",
  "ipfs_content",
  "zk_proof",
  "oracle_data"
] as const;

const isAnthropicTextBlock = (block: unknown): block is AnthropicTextBlock => {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    "text" in block &&
    block.type === "text" &&
    typeof block.text === "string"
  );
};

const isEvaluationResponse = (value: unknown): value is EvaluationResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.fulfilled === "boolean" &&
    typeof candidate.confidence === "number" &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 100 &&
    typeof candidate.reasoning === "string" &&
    candidate.reasoning.length > 0 &&
    typeof candidate.evidenceSummary === "string" &&
    candidate.evidenceSummary.length > 0
  );
};

const extractSeconds = (text: string): number | null => {
  const seconds = text.match(/within\s+(\d+)\s*seconds?/i);
  if (seconds) {
    return Number(seconds[1]);
  }

  const minutes = text.match(/within\s+(\d+)\s*minutes?/i);
  if (minutes) {
    return Number(minutes[1]) * 60;
  }

  const hours = text.match(/within\s+(\d+)\s*hours?/i);
  if (hours) {
    return Number(hours[1]) * 3600;
  }

  return null;
};

const normalizeEvidenceText = (item: EvidenceItem): string => {
  const metadataText = item.metadata ? JSON.stringify(item.metadata) : "";
  return [item.type, item.content, item.value, item.source, metadataText]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
};

const containsFibonacciImplementation = (text: string): boolean => {
  return (
    text.includes("fibonacci") &&
    /function\s+fibonacci|const\s+fibonacci|export\s+function\s+fibonacci/.test(text) &&
    (text.includes("return") || text.includes("=>"))
  );
};

const containsTimeoutFailure = (text: string): boolean => {
  return /\btimeout\b|\bfailed\b|\bmissed\b|\bexpired\b/.test(text);
};

const detectEvidenceTypes = (text: string): string[] => {
  const lower = text.toLowerCase();
  const detected = new Set<string>();

  if (lower.includes("transaction") || lower.includes("onchain") || lower.includes("tx")) {
    detected.add("onchain_tx");
  }

  if (lower.includes("api") || lower.includes("json") || lower.includes("response")) {
    detected.add("api_response");
  }

  if (lower.includes("ipfs") || lower.includes("cid") || lower.includes("content") || lower.includes("code")) {
    detected.add("ipfs_content");
  }

  if (lower.includes("zk") || lower.includes("zero knowledge") || lower.includes("proof")) {
    detected.add("zk_proof");
  }

  if (lower.includes("oracle")) {
    detected.add("oracle_data");
  }

  if (detected.size === 0) {
    detected.add("ipfs_content");
  }

  return Array.from(detected).filter((type) => ALLOWED_EVIDENCE_TYPES.includes(type as (typeof ALLOWED_EVIDENCE_TYPES)[number]));
};

const truncate = (value: string, maxLength: number): string => {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
};

export class ArbiterAgent {
  private readonly anthropic: Anthropic | null;
  private readonly wallet: ethers.Wallet;

  constructor() {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
    this.wallet = new ethers.Wallet(process.env.ARBITER_PRIVATE_KEY!);
  }

  get modeLabel(): string | null {
    return this.anthropic ? null : DETERMINISTIC_ARBITER_MODE;
  }

  /**
   * Parses a natural-language pact commitment into PactNet's structured commitment format.
   */
  async parseCommitment(text: string): Promise<ParsedCommitment> {
    try {
      if (!this.anthropic) {
        return this.parseDeterministically(text);
      }

      const user = JSON.stringify({
        commitmentText: text,
        currentTimestamp: Math.floor(Date.now() / 1000)
      });
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= 2; attempt += 1) {
        const raw = await this.callClaude(PARSE_SYSTEM_PROMPT, user, 512);

        try {
          const parsed = ParsedCommitmentSchema.parse(this.parseJSON<unknown>(raw, "parsed commitment"));
          return parsed;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      throw new Error(`Failed to parse commitment after 3 attempts: ${lastError?.message ?? "unknown parse error"}`);
    } catch (error) {
      throw new Error(`ArbiterAgent.parseCommitment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Evaluates submitted evidence against an active pact and returns a signed arbiter verdict.
   */
  async evaluateEvidence(pact: Pact, evidence: EvidenceBundle): Promise<ArbiterVerdict> {
    try {
      const unsignedVerdict = this.anthropic
        ? await this.evaluateWithClaude(pact, evidence)
        : this.evaluateDeterministically(pact, evidence);

      const confidence = Math.round(unsignedVerdict.confidence);
      const reasoning = unsignedVerdict.reasoning;
      const signature = await this.signSettlementVerdict(pact.id, unsignedVerdict.fulfilled, confidence, reasoning);
      const verdict = ArbiterVerdictSchema.parse({
        pactId: pact.id,
        fulfilled: unsignedVerdict.fulfilled,
        confidence,
        reasoning,
        evidenceSummary: unsignedVerdict.evidenceSummary,
        signature,
        timestamp: Date.now(),
        ...(this.modeLabel ? { arbiterMode: this.modeLabel } : {})
      });

      return verdict;
    } catch (error) {
      throw new Error(`ArbiterAgent.evaluateEvidence failed for pact ${pact.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseDeterministically(text: string): ParsedCommitment {
    const now = Math.floor(Date.now() / 1000);
    const seconds = extractSeconds(text) ?? 24 * 60 * 60;
    const lower = text.toLowerCase();
    const action = lower.includes("fibonacci")
      ? "Return a valid TypeScript fibonacci implementation"
      : truncate(text.replace(/^i\s+commit\s+to\s+/i, ""), 140);
    const successCondition = lower.includes("fibonacci")
      ? "Evidence must include TypeScript code defining a fibonacci function before the deadline."
      : "Evidence must demonstrate completion of the stated commitment before the deadline.";

    return ParsedCommitmentSchema.parse({
      action,
      successCondition,
      evidenceTypes: detectEvidenceTypes(text),
      deadline: now + seconds,
      bondAmountWei: "0",
      confidenceInParse: lower.includes("commit") ? 88 : 72,
      summary: truncate(text, 280),
      obligations: [action],
      successCriteria: [successCondition],
      confidence: lower.includes("commit") ? 88 : 72,
      arbiterMode: DETERMINISTIC_ARBITER_MODE
    });
  }

  private async evaluateWithClaude(
    pact: Pact,
    evidence: EvidenceBundle
  ): Promise<Omit<ArbiterVerdict, "pactId" | "signature" | "timestamp" | "arbiterMode">> {
    const timeNow = Math.floor(Date.now() / 1000);
    const user = JSON.stringify({
      commitmentText: pact.commitmentText ?? pact.commitmentURI ?? pact.commitmentHash,
      successCondition: pact.parsedCommitment?.successCondition ?? "Not parsed",
      deadline: pact.deadline,
      deadlineExpired: pact.deadline ? timeNow > pact.deadline : false,
      timeNow,
      evidence: evidence.evidence
    });

    const raw = await this.callClaude(EVALUATE_SYSTEM_PROMPT, user, 1024);
    const parsed = this.parseJSON<unknown>(raw, "arbiter verdict");

    if (!isEvaluationResponse(parsed)) {
      throw new Error(`Invalid arbiter verdict fields: ${raw}`);
    }

    return {
      fulfilled: parsed.fulfilled,
      confidence: Math.round(parsed.confidence),
      reasoning: parsed.reasoning,
      evidenceSummary: parsed.evidenceSummary
    };
  }

  private evaluateDeterministically(
    pact: Pact,
    evidence: EvidenceBundle
  ): Omit<ArbiterVerdict, "pactId" | "signature" | "timestamp" | "arbiterMode"> {
    const evidenceText = evidence.evidence.map(normalizeEvidenceText).join("\n");
    const deadlineExpired = typeof pact.deadline === "number" && Math.floor(Date.now() / 1000) > pact.deadline;
    const looksLikeTimeout = containsTimeoutFailure(evidenceText);
    const hasFibonacci = containsFibonacciImplementation(evidenceText);
    const hasSubstantiveEvidence = evidence.evidence.some((item) => {
      const text = normalizeEvidenceText(item).trim();
      return text.length >= 16 && !containsTimeoutFailure(text);
    });

    let fulfilled = false;
    let confidence = 65;
    let reasoning = "";

    if (looksLikeTimeout || (deadlineExpired && !hasSubstantiveEvidence)) {
      fulfilled = false;
      confidence = 96;
      reasoning =
        "Deterministic Arbiter Mode found timeout or missing completion evidence after the pact deadline. The submitted evidence does not demonstrate the required commitment was completed.";
    } else if (hasFibonacci) {
      fulfilled = true;
      confidence = 96;
      reasoning =
        "Deterministic Arbiter Mode found TypeScript evidence defining a fibonacci function before settlement. The evidence matches the pact template's success condition.";
    } else if (hasSubstantiveEvidence && !deadlineExpired) {
      fulfilled = true;
      confidence = 88;
      reasoning =
        "Deterministic Arbiter Mode found non-empty completion evidence before the deadline. The evidence is sufficient for the generic pact template.";
    } else {
      fulfilled = false;
      confidence = 90;
      reasoning =
        "Deterministic Arbiter Mode did not find evidence matching the pact's success condition. The submitted material is insufficient to prove fulfillment.";
    }

    const evidenceSummary =
      evidence.evidence.length === 0
        ? "No evidence was submitted."
        : `Deterministic Arbiter Mode evaluated ${evidence.evidence.length} evidence item(s): ${truncate(evidenceText, 180)}`;

    return {
      fulfilled,
      confidence,
      reasoning,
      evidenceSummary
    };
  }

  private async callClaude(system: string, user: string, maxTokens: number): Promise<string> {
    if (!this.anthropic) {
      throw new Error("Anthropic client is not configured");
    }

    const response = await this.anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [
        {
          role: "user",
          content: user
        }
      ]
    });

    const text = (response.content as readonly unknown[])
      .filter(isAnthropicTextBlock)
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      throw new Error("Claude response did not include text content");
    }

    return text;
  }

  private parseJSON<T>(raw: string, context: string): T {
    const trimmed = raw.trim();
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(withoutFence) as T;
    } catch {
      throw new Error(`Failed to parse ${context}: ${raw}`);
    }
  }

  private async signSettlementVerdict(
    pactId: string,
    fulfilled: boolean,
    confidence: number,
    reasoning: string
  ): Promise<string> {
    const reasoningHash = ethers.keccak256(ethers.toUtf8Bytes(reasoning));
    const msgHash = ethers.solidityPackedKeccak256(
      ["uint256", "bool", "uint8", "bytes32"],
      [BigInt(pactId), fulfilled, confidence, reasoningHash]
    );

    return this.wallet.signMessage(ethers.getBytes(msgHash));
  }
}
