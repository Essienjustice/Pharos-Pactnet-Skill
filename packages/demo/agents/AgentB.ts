import type { ArbiterVerdict, Pact, PactClient } from "@pactnet/agent-sdk";

export class AgentB {
  private lastState: string | null = null;

  constructor(private readonly client: PactClient) {}

  watchAndLog(
    pactId: string,
    onUpdate: (status: { pact: Pact; verdict: ArbiterVerdict | null }) => void = () => undefined
  ): () => void {
    console.log(`[AgentB] Watching pact ${pactId}`);
    return this.client.watchPact(pactId, (pact: Pact, verdict: ArbiterVerdict | null) => {
      onUpdate({ pact, verdict });

      if (pact.state !== this.lastState) {
        console.log(`[AgentB] Pact ${pactId} state changed: ${this.lastState ?? "unknown"} -> ${pact.state}`);
        this.lastState = pact.state;
      }

      if (verdict) {
        console.log(
          `[AgentB] Verdict observed: ${verdict.fulfilled ? "fulfilled" : "breached"} at ${verdict.confidence}% confidence`
        );
      }
    });
  }
}
