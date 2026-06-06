import Link from "next/link";
import { NATIVE_TOKEN_SYMBOL } from "../lib/config";
import { formatEth, formatTimestamp, truncateAddress } from "../lib/format";

export type PactState = "Pending" | "Active" | "Fulfilled" | "Breached" | "Disputed";

export type PactStatusResponse = {
  pact: {
    id: string;
    agentA?: string;
    agentB?: string;
    creator?: string;
    counterparty?: string;
    commitmentText?: string;
    bond?: string;
    stakeWei?: string;
    deadline?: number;
    state: PactState;
  } | null;
  verdict: {
    fulfilled: boolean;
    confidence: number;
    reasoning: string;
    evidenceSummary: string;
    signature: string;
    timestamp: number;
    arbiterMode?: string;
  } | null;
  arbiterMode?: string;
};

export function PactStatusRow({ id, status }: { id: string; status: PactStatusResponse }) {
  const pact = status.pact;
  const agentA = pact?.agentA ?? pact?.creator ?? "unknown";
  const agentB = pact?.agentB ?? pact?.counterparty ?? "unknown";

  return (
    <Link className="row-link" href={`/pact/${id}`}>
      <span>#{id}</span>
      <span className={`badge ${pact?.state ?? "Pending"}`}>{pact?.state ?? "Missing"}</span>
      <span>{truncateAddress(agentA)} to {truncateAddress(agentB)}</span>
      <span>{formatEth(pact?.bond ?? pact?.stakeWei ?? "0")} {NATIVE_TOKEN_SYMBOL}</span>
      <span>{pact?.deadline ? formatTimestamp(pact.deadline) : "No deadline"}</span>
    </Link>
  );
}
