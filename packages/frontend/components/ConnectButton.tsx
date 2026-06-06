"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { truncateAddress } from "../lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors[0];

  if (isConnected && address) {
    return (
      <div className="wallet-box">
        <button className="button secondary" type="button" onClick={() => disconnect()}>
          {truncateAddress(address)}
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-box">
      <button
        className="button primary"
        type="button"
        disabled={isPending || !injectedConnector}
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      >
        {isPending ? "Connecting..." : "Connect wallet"}
      </button>
      {error ? <p className="error-text compact">{error.message}</p> : null}
    </div>
  );
}
