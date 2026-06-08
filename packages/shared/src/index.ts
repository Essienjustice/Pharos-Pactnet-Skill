import { z } from "zod";

export const PactStateSchema = z.enum(["Pending", "Draft", "Active", "Fulfilled", "Breached", "Disputed", "Cancelled"]);
export const EvidenceTypeSchema = z.enum([
  "Text",
  "Url",
  "Transaction",
  "Artifact",
  "Attestation",
  "onchain_tx",
  "api_response",
  "ipfs_content",
  "zk_proof",
  "oracle_data"
]);
export const PactStatusSchema = z.enum(["draft", "active", "fulfilled", "disputed", "cancelled"]);

export const PactSchema = z.object({
  id: z.string(),
  creator: z.string().optional(),
  counterparty: z.string().optional(),
  arbiter: z.string().optional(),
  termsHash: z.string().optional(),
  stakeWei: z.string().optional(),
  agentA: z.string().optional(),
  agentB: z.string().optional(),
  commitmentText: z.string().optional(),
  parsedCommitment: z.object({ successCondition: z.string().optional() }).optional().nullable(),
  commitmentHash: z.string().optional(),
  commitmentURI: z.string().optional(),
  bond: z.string().optional(),
  deadline: z.number().optional(),
  state: PactStateSchema,
  createdAt: z.number().optional()
});

export type PactStatus = z.infer<typeof PactStatusSchema>;
export type PactState = z.infer<typeof PactStateSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type Pact = z.infer<typeof PactSchema>;

export const ParsedCommitmentSchema = z.object({
  action: z.string().optional(),
  successCondition: z.string().optional(),
  evidenceTypes: z.array(z.string()).optional(),
  deadline: z.number().optional(),
  bondAmountWei: z.string().optional(),
  confidenceInParse: z.number().min(0).max(100).optional(),
  summary: z.string().optional(),
  obligations: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  counterparty: z.string().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  arbiterMode: z.string().optional()
});

export type ParsedCommitment = z.infer<typeof ParsedCommitmentSchema>;

export const EvidenceItemSchema = z.object({
  type: EvidenceTypeSchema,
  content: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().optional(),
  timestamp: z.number().int().positive().optional()
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvidenceBundleSchema = z.object({
  pactId: z.string().min(1),
  submittedBy: z.string().optional(),
  evidence: z.array(EvidenceItemSchema).min(1),
  notes: z.string().optional()
});

export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export const DETERMINISTIC_ARBITER_MODE = "Deterministic Arbiter Mode";

export const ArbiterVerdictSchema = z.object({
  pactId: z.string(),
  fulfilled: z.boolean(),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
  evidenceSummary: z.string(),
  signature: z.string(),
  timestamp: z.number().int().positive(),
  arbiterMode: z.string().optional()
});

export type ArbiterVerdict = z.infer<typeof ArbiterVerdictSchema>;

export const ReputationScoreSchema = z.object({
  address: z.string(),
  score: z.number().int().min(0).max(100),
  completedPacts: z.number().int().min(0),
  disputedPacts: z.number().int().min(0),
  updatedAt: z.number().int().positive()
});

export type ReputationScore = z.infer<typeof ReputationScoreSchema>;

export const AgentTrustScoreSchema = z.object({
  address: z.string(),
  fulfilled: z.number().int().min(0),
  breached: z.number().int().min(0),
  disputed: z.number().int().min(0),
  reliabilityPct: z.number().int().min(0).max(100),
  totalBondHonored: z.string(),
  totalBondSlashed: z.string(),
  riskTier: z.enum(["LOW", "MEDIUM", "HIGH"])
});

export type AgentTrustScore = z.infer<typeof AgentTrustScoreSchema>;

export const CreatePactSchema = z.object({
  agentB: z.string().min(1).optional(),
  counterparty: z.string().min(1).optional(),
  arbiter: z.string().min(1).optional(),
  commitmentText: z.string().min(20).optional(),
  commitmentURI: z.string().optional(),
  deadline: z.number().int().positive().optional(),
  deadlineSeconds: z.number().int().positive().optional(),
  bondWei: z.string().min(1).optional(),
  termsHash: z.string().min(1).optional(),
  stakeWei: z.string().min(1).optional()
});

export type CreatePactInput = z.infer<typeof CreatePactSchema>;

export const SubmitEvidenceInputSchema = z.object({
  pactId: z.string().min(1),
  evidence: z.array(EvidenceItemSchema).min(1)
});

export type SubmitEvidenceInput = z.infer<typeof SubmitEvidenceInputSchema>;

export const SubmitEvidenceSchema = EvidenceBundleSchema;

export const ParseRequestSchema = z.object({
  text: z.string().min(1).max(10000)
});

export const CONFIDENCE_THRESHOLD_AUTO_SETTLE = 85;
