"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type Address, isAddress } from "viem";
import { useReadContract } from "wagmi";
import { ReputationCard } from "../../../components/ReputationCard";
import type { PactStatusResponse } from "../../../components/PactStatusRow";
import { PactEngineAbi } from "../../../lib/abis";
import { ARBITER_URL, ENGINE_ADDRESS, NATIVE_TOKEN_SYMBOL } from "../../../lib/config";
import { formatEth, formatTimestamp, truncateAddress } from "../../../lib/format";

async function fetchPactStatus(id: string): Promise<PactStatusResponse> {
  const response = await fetch(`${ARBITER_URL}/arbiter/pact/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pact ${id}: ${response.status}`);
  }

  return response.json() as Promise<PactStatusResponse>;
}

export default function AgentPage({ params }: { params: { address: string } }) {
  const address = params.address;
  const validAddress = isAddress(address);
  const pactIdsQuery = useReadContract({
    address: ENGINE_ADDRESS,
    abi: PactEngineAbi,
    functionName: "getAgentPacts",
    args: [address as Address],
    query: {
      enabled: validAddress
    }
  });

  const pactIds = (pactIdsQuery.data ?? []).map((id) => id.toString());
  const pactStatusesQuery = useQuery({
    queryKey: ["agent-pacts", address, pactIds],
    queryFn: () => Promise.all(pactIds.map(fetchPactStatus)),
    enabled: validAddress && pactIds.length > 0
  });

  if (!validAddress) {
    return (
      <main className="page">
        <p className="error-text">Invalid agent address.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <Link className="back-link" href="/">
        Back
      </Link>
      <h1>Agent {truncateAddress(address)}</h1>
      <ReputationCard address={address} />

      <section className="section">
        <div className="section-header">
          <h2>Pacts</h2>
          <span>{pactIds.length} total</span>
        </div>
        {pactIdsQuery.isLoading ? (
          <div className="skeleton-list">
            <div />
            <div />
            <div />
          </div>
        ) : pactIdsQuery.isError ? (
          <p className="error-text">{pactIdsQuery.error.message}</p>
        ) : pactIds.length === 0 ? (
          <p className="muted">No pacts found for this agent.</p>
        ) : pactStatusesQuery.isLoading ? (
          <div className="skeleton-list">
            <div />
            <div />
            <div />
          </div>
        ) : pactStatusesQuery.isError ? (
          <p className="error-text">{pactStatusesQuery.error.message}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pact ID</th>
                  <th>Counterparty</th>
                  <th>State</th>
                  <th>Bond</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {pactStatusesQuery.data?.map((status, index) => {
                  const pact = status.pact;
                  const agentA = pact?.agentA ?? pact?.creator ?? "";
                  const agentB = pact?.agentB ?? pact?.counterparty ?? "";
                  const counterparty = agentA.toLowerCase() === address.toLowerCase() ? agentB : agentA;

                  return (
                    <tr key={pactIds[index]}>
                      <td>
                        <Link href={`/pact/${pactIds[index]}`}>#{pactIds[index]}</Link>
                      </td>
                      <td>{truncateAddress(counterparty)}</td>
                      <td>
                        <span className={`badge ${pact?.state ?? "Pending"}`}>{pact?.state ?? "Missing"}</span>
                      </td>
                      <td>{formatEth(pact?.bond ?? pact?.stakeWei ?? "0")} {NATIVE_TOKEN_SYMBOL}</td>
                      <td>{pact?.deadline ? formatTimestamp(pact.deadline) : "No deadline"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
