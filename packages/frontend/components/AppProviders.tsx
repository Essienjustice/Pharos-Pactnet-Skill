"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";
import { CHAIN_ID, NATIVE_TOKEN_SYMBOL, PHAROS_RPC_URL } from "../lib/config";

const getPharosChainName = (chainId: number) => {
  if (chainId === 1672) {
    return "Pharos Pacific Mainnet";
  }

  if (chainId === 688688) {
    return "Pharos Testnet";
  }

  if (chainId === 688689) {
    return "Pharos Atlantic Testnet";
  }

  return "Pharos";
};

const pharosChain = defineChain({
  id: CHAIN_ID,
  name: getPharosChainName(CHAIN_ID),
  nativeCurrency: {
    decimals: 18,
    name: "Pharos",
    symbol: NATIVE_TOKEN_SYMBOL
  },
  rpcUrls: {
    default: {
      http: [PHAROS_RPC_URL]
    }
  }
});

const wagmiConfig = createConfig({
  chains: [pharosChain],
  connectors: [injected()],
  transports: {
    [pharosChain.id]: http(PHAROS_RPC_URL)
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
