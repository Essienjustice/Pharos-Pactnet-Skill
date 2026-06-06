"use client";

import { RouteErrorCard } from "../../../components/RouteErrorCard";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorCard error={error} reset={reset} />;
}
