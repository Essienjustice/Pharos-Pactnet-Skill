"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";
import { CHAIN_ID, PHAROS_RPC_URL } from "../lib/config";

const pharosTestnet = defineChain({
  id: CHAIN_ID,
  name: "Pharos Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Pharos",
    symbol: "PHRS"
  },
  rpcUrls: {
    default: {
      http: [PHAROS_RPC_URL]
    }
  }
});

const wagmiConfig = createConfig({
  chains: [pharosTestnet],
  connectors: [injected()],
  transports: {
    [pharosTestnet.id]: http(PHAROS_RPC_URL)
  },
  ssr: true
});

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
