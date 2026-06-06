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

type RequestOptions = {
  timeoutMs?: number;
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
    try {
      return await this.request<ArbiterVerdict>(
        "/arbiter/evaluate",
        {
          method: "POST",
          body: JSON.stringify(input)
        },
        { timeoutMs: 60_000 }
      );
    } catch (error) {
      if (!(error instanceof ArbiterClientError) || (error.status !== null && error.status !== 409 && error.status !== 503)) {
        throw error;
      }

      const recovered = await this.waitForSubmittedVerdict(input.pactId);
      if (recovered) {
        return recovered;
      }

      throw error;
    }
  }

  async getPactStatus(pactId: string): Promise<PactStatus> {
    return this.request<PactStatus>(`/arbiter/pact/${encodeURIComponent(pactId)}`, {
      method: "GET"
    });
  }

  private async waitForSubmittedVerdict(pactId: string): Promise<ArbiterVerdict | null> {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await sleep(1000 * attempt);
      try {
        const status = await this.getPactStatus(pactId);
        if (status.verdict) {
          return status.verdict;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Arbiter verdict recovery attempt ${attempt} failed for pact ${pactId}: ${message}`);
      }
    }

    return null;
  }

  private async request<T>(path: string, init: RequestInit, options: RequestOptions = {}, attempt = 0): Promise<T> {
    const endpoint = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

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
        return this.request<T>(path, init, options, attempt + 1);
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
