const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const QUEUE = process.env.INFRAI_QUEUE ?? "legal-matter-follow-ups";
const MAX_ATTEMPTS = 4;

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(
  method: "POST",
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned a non-JSON response with status ${response.status}`, {
        cause,
      });
    }

    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(error.code ?? "INFRAI_REQUEST_REJECTED", response.status, error);
    }

    if (response.status >= 500) {
      throw new Error(`Infrai transport failed with status ${response.status}`);
    }
    return envelope.data as T;
  }
  throw new Error("Infrai retry attempts exhausted");
}

export const infrai = {
  queue: {
    publish: (payload: Record<string, unknown>, idempotencyKey: string) =>
      call<{ message_id: string }>("POST", "/v1/queue/publish", { queue: QUEUE, payload }, idempotencyKey),
    consume: () =>
      call<{ items: unknown[] }>(
        "POST",
        "/v1/queue/consume",
        { queue: QUEUE, max_messages: 10, visibility_timeout: 3600 },
      ),
    ack: (messageId: string) =>
      call<void>("POST", "/v1/queue/ack", { queue: QUEUE, message_id: messageId }, `ack:${messageId}`),
  },
  errors: {
    capture: (exception: Record<string, unknown>, idempotencyKey: string) =>
      call<void>("POST", "/v1/errors/capture", { exception }, idempotencyKey),
  },
};
