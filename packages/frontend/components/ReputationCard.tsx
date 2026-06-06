"use client";

import { type Address } from "viem";
import { useReadContract } from "wagmi";
import { ReputationNFTAbi } from "../lib/abis";
import { NATIVE_TOKEN_SYMBOL, NFT_ADDRESS } from "../lib/config";
import { formatEth, truncateAddress } from "../lib/format";

export function ReputationCard({ address }: { address: string }) {
  const scoreQuery = useReadContract({
    address: NFT_ADDRESS,
    abi: ReputationNFTAbi,
    functionName: "getScore",
    args: [address as Address],
    query: {
      enabled: Boolean(address)
    }
  });

  if (scoreQuery.isLoading) {
    return (
      <div className="info-card">
        <div className="skeleton-list">
          <div />
          <div />
          <div />
        </div>
      </div>
    );
  }

  if (scoreQuery.isError) {
    return <p className="error-text">{scoreQuery.error.message}</p>;
  }

  const score = scoreQuery.data;
  const fulfilled = Number(score?.fulfilled ?? 0);
  const breached = Number(score?.breached ?? 0);
  const total = fulfilled + breached;
  const reliability = total === 0 ? 0 : Math.round((fulfilled / total) * 100);

  return (
    <section className="info-card">
      <div className="section-header">
        <h2>Reputation</h2>
        <span>{truncateAddress(address)}</span>
      </div>
      <div className="metric-grid">
        <div>
          <span className="metric-value good">{fulfilled}</span>
          <span className="metric-label">Fulfilled</span>
        </div>
        <div>
          <span className="metric-value bad">{breached}</span>
          <span className="metric-label">Breached</span>
        </div>
        <div>
          <span className="metric-value">{reliability}%</span>
          <span className="metric-label">Reliability</span>
        </div>
        <div>
          <span className="metric-value">{formatEth(score?.totalBondHonored ?? 0n)} {NATIVE_TOKEN_SYMBOL}</span>
          <span className="metric-label">Bond honored</span>
        </div>
        <div>
          <span className="metric-value">{formatEth(score?.totalBondSlashed ?? 0n)} {NATIVE_TOKEN_SYMBOL}</span>
          <span className="metric-label">Bond slashed</span>
        </div>
      </div>
    </section>
  );
}
