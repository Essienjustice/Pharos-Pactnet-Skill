"use client";

export function RouteErrorCard({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page narrow">
      <section className="section">
        <h1>Something went sideways</h1>
        <p className="muted">{error.message || "The page could not finish loading."}</p>
        <button className="button primary" type="button" onClick={reset}>
          Retry
        </button>
      </section>
    </main>
  );
}
