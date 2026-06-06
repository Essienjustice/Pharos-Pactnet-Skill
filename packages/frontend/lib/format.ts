import { formatEther } from "viem";

export function truncateAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEth(valueWei: string | bigint) {
  try {
    return Number(formatEther(BigInt(valueWei))).toLocaleString(undefined, {
      maximumFractionDigits: 4
    });
  } catch {
    return "0";
  }
}

export function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp * 1000));
}

export function secondsUntil(timestamp: number) {
  return Math.max(0, timestamp - Math.floor(Date.now() / 1000));
}
