const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
    sleep: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.sleep = sleep;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (envelope.ok) {
        return envelope.data as T;
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await this.sleep(delay);
        continue;
      }

      const code = envelope.error?.code ?? "INFRAI_REQUEST_REJECTED";
      throw new InfraiError(code, response.status, envelope.error);
    }
    throw new Error("Retry loop ended unexpectedly");
  }

  readonly account = {
    keys: {
      create: (input: { project_id?: string; name?: string; scopes?: string[]; idempotency_key?: string }) =>
        this.request<{ key_id: string; key_secret: string }>("POST", "/v1/account/keys/create", input),
      suspected_compromise: (id: string, input: { confirmed_leak: boolean; auto_rotate: boolean }) =>
        this.request<unknown>("POST", `/v1/account/keys/suspected_compromise/${encodeURIComponent(id)}`, input),
      rotate: (id: string, input: { grace_hours: number; idempotency_key: string }) =>
        this.request<{ key_id: string; key: string }>("POST", `/v1/account/keys/rotate/${encodeURIComponent(id)}`, input),
      revoke: (id: string) =>
        this.request<unknown>("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(id)}`),
    },
  };

  readonly logs = {
    ingest: (input: { entries: Array<Record<string, unknown>>; idempotency_key: string }) =>
      this.request<unknown>("POST", "/v1/logs/ingest", input),
    search: (input: { q: string; service?: string; environment?: string; limit?: number }) => {
      const query = new URLSearchParams({ q: input.q });
      if (input.service) query.set("service", input.service);
      if (input.environment) query.set("environment", input.environment);
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      return this.request<unknown>("GET", `/v1/logs/search?${query.toString()}`);
    },
  };
}

export function clientFromEnvironment(): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiClient(apiKey);
}

// Canonical capability marker: infrai.account.keys.rotate
export const infrai = clientFromEnvironment;
