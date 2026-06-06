"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { decodeEventLog, isAddress, parseEther, toHex, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { PactEngineAbi } from "../../lib/abis";
import { ARBITER_URL, ENGINE_ADDRESS, NATIVE_TOKEN_SYMBOL } from "../../lib/config";

type ParsedCommitment = {
  action: string;
  successCondition: string;
  evidenceTypes: string[];
  deadline: number;
  bondAmountWei: string;
  confidenceInParse: number;
  arbiterMode?: string;
};

const confidenceClass = (confidence: number) => {
  if (confidence >= 80) {
    return "success";
  }

  if (confidence >= 60) {
    return "warning";
  }

  return "danger";
};

export default function CreatePactPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const [commitmentText, setCommitmentText] = useState("");
  const [agentB, setAgentB] = useState("");
  const [bondEth, setBondEth] = useState("0.01");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [parsedCommitment, setParsedCommitment] = useState<ParsedCommitment | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPactId, setSuccessPactId] = useState<string | null>(null);

  const validationError = useMemo(() => {
    if (commitmentText.trim().length < 20) {
      return "Commitment text must be at least 20 characters.";
    }

    if (parsedCommitment && !isAddress(agentB)) {
      return "Agent B must be a valid wallet address.";
    }

    if (parsedCommitment && address && agentB.toLowerCase() === address.toLowerCase()) {
      return "Agent B must be different from your connected wallet.";
    }

    if (parsedCommitment && Number(bondEth) <= 0) {
      return `Bond must be greater than 0 ${NATIVE_TOKEN_SYMBOL}.`;
    }

    if (parsedCommitment && Number(deadlineHours) <= 0) {
      return "Deadline must be at least 1 hour.";
    }

    return null;
  }, [address, agentB, bondEth, commitmentText, deadlineHours, parsedCommitment]);

  async function previewCommitment() {
    setError(null);
    setSuccessPactId(null);

    if (commitmentText.trim().length < 20) {
      setError("Commitment text must be at least 20 characters.");
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await fetch(`${ARBITER_URL}/arbiter/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commitmentText })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Preview failed with status ${response.status}`);
      }

      setParsedCommitment((await response.json()) as ParsedCommitment);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to preview commitment.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function createPact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessPactId(null);

    if (!isConnected) {
      setError("Connect your wallet before creating a pact.");
      return;
    }

    if (!parsedCommitment) {
      setError("Preview the commitment before creating a pact.");
      return;
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      if (!publicClient) {
        throw new Error("Wallet network client is not ready.");
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(deadlineHours) * 3600));
      const hash = await writeContractAsync({
        address: ENGINE_ADDRESS,
        abi: PactEngineAbi,
        functionName: "createPact",
        args: [agentB as Address, commitmentText, toHex(`pactnet://commitments/${Date.now()}`), deadline],
        value: parseEther(bondEth)
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const createdLog = receipt.logs.find((log) => {
        if (log.address.toLowerCase() !== ENGINE_ADDRESS.toLowerCase()) {
          return false;
        }

        try {
          const decoded = decodeEventLog({
            abi: PactEngineAbi,
            data: log.data,
            topics: log.topics
          });

          return decoded.eventName === "PactCreated";
        } catch {
          return false;
        }
      });

      if (!createdLog) {
        throw new Error("PactCreated event was not found in the transaction receipt.");
      }

      const decoded = decodeEventLog({
        abi: PactEngineAbi,
        data: createdLog.data,
        topics: createdLog.topics
      });
      const pactId = decoded.eventName === "PactCreated" ? decoded.args.id.toString() : hash;

      setSuccessPactId(pactId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create pact.");
    }
  }

  return (
    <main className="page narrow">
      <Link className="back-link" href="/">
        Back
      </Link>
      <section className="section">
        <h1>Create a pact</h1>
        <label className="field">
          <span>Commitment text</span>
          <textarea
            minLength={20}
            value={commitmentText}
            onChange={(event) => {
              setCommitmentText(event.target.value);
              setParsedCommitment(null);
            }}
            placeholder="Agent A will deliver..."
          />
        </label>
        <button className="button primary" type="button" disabled={isPreviewing} onClick={previewCommitment}>
          {isPreviewing ? "Previewing..." : "Preview"}
        </button>

        {parsedCommitment ? (
          <div className="info-card">
            <div className="section-header">
              <h2>Parsed commitment</h2>
              <span className={`badge ${confidenceClass(parsedCommitment.confidenceInParse)}`}>
                {parsedCommitment.confidenceInParse}% confidence
              </span>
            </div>
            {parsedCommitment.arbiterMode ? <div className="banner mode">{parsedCommitment.arbiterMode}</div> : null}
            <dl className="details">
              <div>
                <dt>Action</dt>
                <dd>{parsedCommitment.action}</dd>
              </div>
              <div>
                <dt>Success condition</dt>
                <dd>{parsedCommitment.successCondition}</dd>
              </div>
              <div>
                <dt>Evidence types</dt>
                <dd>{parsedCommitment.evidenceTypes.join(", ")}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {parsedCommitment ? (
          <form className="form-grid" onSubmit={createPact}>
            <label className="field">
              <span>Agent B address</span>
              <input value={agentB} onChange={(event) => setAgentB(event.target.value)} placeholder="0x..." />
            </label>
            <label className="field">
              <span>Bond {NATIVE_TOKEN_SYMBOL}</span>
              <input type="number" min="0.001" step="0.001" value={bondEth} onChange={(event) => setBondEth(event.target.value)} />
            </label>
            <label className="field">
              <span>Deadline hours</span>
              <input
                type="number"
                min="1"
                step="1"
                value={deadlineHours}
                onChange={(event) => setDeadlineHours(event.target.value)}
              />
            </label>
            <button className="button primary" type="submit" disabled={isWriting}>
              {isWriting ? "Creating..." : "Create Pact"}
            </button>
          </form>
        ) : null}

        {validationError ? <p className="muted">{validationError}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {successPactId ? (
          <div className="info-card success-card">
            <h2>Pact submitted</h2>
            <p>Pact ID: {successPactId}</p>
            <Link className="button secondary" href={`/pact/${successPactId}`}>
              View pact
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
