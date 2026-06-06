"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { PactStatusResponse, PactState } from "./PactStatusRow";
import { ARBITER_URL, NATIVE_TOKEN_SYMBOL } from "../lib/config";
import { formatEth, formatTimestamp, secondsUntil, truncateAddress } from "../lib/format";

const stateClass = (state: PactState | undefined) => {
  if (state === "Active") return "Active";
  if (state === "Fulfilled") return "Fulfilled";
  if (state === "Breached") return "Breached";
  if (state === "Disputed") return "Disputed";
  return "Pending";
};

async function fetchPact(id: string): Promise<PactStatusResponse> {
  const response = await fetch(`${ARBITER_URL}/arbiter/pact/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to load pact ${id}: ${response.status}`);
  }

  return response.json() as Promise<PactStatusResponse>;
}

export function PactDetail({ id }: { id: string }) {
  const { address } = useAccount();
  const [evidenceType, setEvidenceType] = useState("onchain_tx");
  const [evidenceValue, setEvidenceValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pactQuery = useQuery({
    queryKey: ["pact", id],
    queryFn: () => fetchPact(id),
    refetchInterval: 5000
  });

  const submitEvidence = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${ARBITER_URL}/arbiter/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pactId: id,
          evidence: [
            {
              type: evidenceType,
              content: evidenceValue,
              timestamp: Math.floor(Date.now() / 1000)
            }
          ]
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Evidence submission failed with status ${response.status}`);
      }

      return response.json();
    },
    onSuccess: async () => {
      setEvidenceValue("");
      setSubmitError(null);
      await pactQuery.refetch();
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : "Evidence submission failed.");
    }
  });

  const pact = pactQuery.data?.pact;
  const verdict = pactQuery.data?.verdict;
  const arbiterMode = verdict?.arbiterMode ?? pactQuery.data?.arbiterMode;
  const agentA = pact?.agentA ?? pact?.creator ?? "";
  const agentB = pact?.agentB ?? pact?.counterparty ?? "";
  const isAgentA = Boolean(address && agentA && address.toLowerCase() === agentA.toLowerCase());
  const canSubmitEvidence = pact?.state === "Active" && isAgentA;
  const countdown = useMemo(() => (pact?.deadline ? secondsUntil(pact.deadline) : 0), [pact?.deadline]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!evidenceValue.trim()) {
      setSubmitError("Evidence value is required.");
      return;
    }

    submitEvidence.mutate();
  }

  return (
    <main className="page">
      <Link className="back-link" href="/">
        Back
      </Link>
      {pactQuery.isLoading ? (
        <div className="skeleton-list">
          <div />
          <div />
          <div />
        </div>
      ) : pactQuery.isError ? (
        <p className="error-text">{pactQuery.error.message}</p>
      ) : pact ? (
        <section className="section">
          <div className="section-header">
            <h1>Pact #{id}</h1>
            <span className={`badge ${stateClass(pact.state)}`}>{pact.state}</span>
          </div>

          {arbiterMode ? <div className="banner mode">{arbiterMode}</div> : null}
          {pact.state === "Disputed" ? <div className="banner warning">This pact is disputed.</div> : null}

          <dl className="details">
            <div>
              <dt>Commitment</dt>
              <dd>{pact.commitmentText ?? "Commitment text is not available from arbiter status."}</dd>
            </div>
            <div>
              <dt>Agent A</dt>
              <dd>{truncateAddress(agentA)}</dd>
            </div>
            <div>
              <dt>Agent B</dt>
              <dd>{truncateAddress(agentB)}</dd>
            </div>
            <div>
              <dt>Bond</dt>
              <dd>{formatEth(pact.bond ?? pact.stakeWei ?? "0")} {NATIVE_TOKEN_SYMBOL}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>{pact.deadline ? `${formatTimestamp(pact.deadline)} (${countdown}s remaining)` : "No deadline"}</dd>
            </div>
          </dl>

          {canSubmitEvidence ? (
            <form className="info-card form-grid" onSubmit={handleSubmit}>
              <h2>Submit evidence</h2>
              <label className="field">
                <span>Evidence type</span>
                <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}>
                  <option value="onchain_tx">onchain_tx</option>
                  <option value="api_response">api_response</option>
                  <option value="ipfs_content">ipfs_content</option>
                </select>
              </label>
              <label className="field">
                <span>Value</span>
                <input value={evidenceValue} onChange={(event) => setEvidenceValue(event.target.value)} placeholder="Transaction hash, API URL, or IPFS CID" />
              </label>
              <button className="button primary" type="submit" disabled={submitEvidence.isPending}>
                {submitEvidence.isPending ? "Submitting..." : "Submit"}
              </button>
              {submitError ? <p className="error-text">{submitError}</p> : null}
            </form>
          ) : null}

          {verdict ? (
            <div className="info-card">
              <div className="section-header">
                <h2>{verdict.fulfilled ? "Fulfilled" : "Breached"}</h2>
                <span className={`badge ${verdict.fulfilled ? "success" : "danger"}`}>{verdict.confidence}% confidence</span>
              </div>
              <div className="meter">
                <span style={{ width: `${verdict.confidence}%` }} />
              </div>
              <p>{verdict.reasoning}</p>
              {verdict.arbiterMode ? <p className="mode-text">{verdict.arbiterMode}</p> : null}
              <p className="muted">{verdict.evidenceSummary}</p>
              <dl className="details">
                <div>
                  <dt>Signature</dt>
                  <dd>{verdict.signature.slice(0, 20)}…</dd>
                </div>
                <div>
                  <dt>Timestamp</dt>
                  <dd>{new Date(verdict.timestamp).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="muted">Pact not found.</p>
      )}
    </main>
  );
}
