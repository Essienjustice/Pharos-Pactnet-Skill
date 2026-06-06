import type { ArbiterVerdict, Pact, ParsedCommitment, SubmitEvidenceInput } from "@pactnet/shared";

export class ArbiterClientError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly endpoint: string
  ) {
    super(message);
    this.name = "ArbiterClientError";
  }
}

type PactStatus = {
  pact: Pact;
  verdict: ArbiterVerdict | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ArbiterClient {
  constructor(private readonly baseUrl: string) {}

  async parseCommitment(text: string): Promise<ParsedCommitment> {
    return this.request<ParsedCommitment>("/arbiter/parse", {
      method: "POST",
      body: JSON.stringify({ text })
    });
  }

  async submitEvidence(input: SubmitEvidenceInput): Promise<ArbiterVerdict> {
    return this.request<ArbiterVerdict>("/arbiter/evaluate", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async getPactStatus(pactId: string): Promise<PactStatus> {
    return this.request<PactStatus>(`/arbiter/pact/${encodeURIComponent(pactId)}`, {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    const endpoint = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(endpoint, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {})
        },
        signal: controller.signal
      });

      if (response.status === 503 && attempt < 2) {
        await sleep(1000);
        return this.request<T>(path, init, attempt + 1);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new ArbiterClientError(
          `Arbiter request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
          response.status,
          endpoint
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ArbiterClientError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new ArbiterClientError(`Arbiter request error: ${message}`, null, endpoint);
    } finally {
      clearTimeout(timeout);
    }
  }
}
