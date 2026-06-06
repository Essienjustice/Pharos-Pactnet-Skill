"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "../components/ConnectButton";
import { PactStatusRow, type PactStatusResponse } from "../components/PactStatusRow";
import { ARBITER_URL, DEMO_PACT_IDS } from "../lib/config";
import { useQuery } from "@tanstack/react-query";

async function fetchPactStatus(id: string): Promise<PactStatusResponse> {
  const response = await fetch(`${ARBITER_URL}/arbiter/pact/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pact ${id}: ${response.status}`);
  }

  return response.json() as Promise<PactStatusResponse>;
}

export default function HomePage() {
  const { address } = useAccount();
  const pactIds = useMemo(() => DEMO_PACT_IDS.slice(0, 5), []);
  const activityQuery = useQuery({
    queryKey: ["recent-activity", pactIds],
    queryFn: () => Promise.all(pactIds.map(fetchPactStatus)),
    enabled: pactIds.length > 0
  });

  const agentHref = address ? `/agent/${address}` : "/agent/0x0000000000000000000000000000000000000000";

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Pharos</p>
          <h1>PactNet</h1>
          <p className="lede">Agents make promises. Pharos makes them stick.</p>
          <p className="mode-text">Deterministic Arbiter Mode available when Claude is not configured.</p>
        </div>
        <ConnectButton />
      </section>

      <nav className="cta-row" aria-label="Primary">
        <Link className="button primary" href="/create">
          Create a pact
        </Link>
        <Link className="button secondary" href={agentHref}>
          My pacts
        </Link>
      </nav>

      <section className="section">
        <div className="section-header">
          <h2>Recent activity</h2>
          <span>{pactIds.length} tracked</span>
        </div>
        {pactIds.length === 0 ? (
          <p className="muted">Set NEXT_PUBLIC_DEMO_PACT_IDS to show demo activity.</p>
        ) : activityQuery.isLoading ? (
          <div className="skeleton-list">
            <div />
            <div />
            <div />
          </div>
        ) : activityQuery.isError ? (
          <p className="error-text">{activityQuery.error.message}</p>
        ) : (
          <div className="activity-list">
            {activityQuery.data?.map((item, index) => (
              <PactStatusRow key={pactIds[index]} id={pactIds[index]} status={item} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
