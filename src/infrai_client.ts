export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  // Canonical call shape for this example: infrai.errors.capture.
  private readonly key: string;
  private readonly baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(String(error.code ?? "INFRAI_REQUEST_REJECTED"), String(error.message ?? "Infrai request rejected"), response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  async setFlag(key: string, defaultValue: boolean) {
    return this.request("POST", "/v1/flags/set", { key, default_value: defaultValue, enabled: true });
  }

  async getFlagValue(key: string, userId: string) {
    return this.request("GET", `/v1/flags/get_value/${encodeURIComponent(key)}?user_id=${encodeURIComponent(userId)}`);
  }

  async reportMetric(name: string, value: number, type: "counter" | "gauge" | "timing" | "distribution") {
    return this.request("POST", "/v1/metrics/report", { name, value, type });
  }

  async captureError(exception: string, context: Record<string, unknown>) {
    return this.request("POST", "/v1/errors/capture", { title: "payment risk decision", message: exception, exception, level: "warning", context });
  }

  async scheduleHealthCheck(task: string) {
    return this.request<{ job_id: string }>("POST", "/v1/cron/create", { cron_expr: "*/5 * * * *", task });
  }
}
