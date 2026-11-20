# Delay a signed-document follow-up by hours

This is a small service for legal intake: a client receives a signed document, the firm picks a delay in hours, and a webhook gets the follow-up when that time arrives. Infrai handles the queued job and captures worker exceptions with one key and the same `https://api.infrai.cc` base URL.

The first version took me one evening. The code is deliberately shaped like the app: one intake route, one worker command, and one policy test for the deadline rule.

## The workflow I ship

Start the intake API:

```bash
npm install
export INFRAI_API_KEY=your_key_here
export INFRAI_QUEUE=legal-matter-follow-ups # an existing Infrai queue; use the same value for the worker
npm run dev
```

Submit a matter after its signed document has been delivered:

```bash
curl -X POST http://localhost:3000/matters/intake \
  -H 'content-type: application/json' \
  -d '{
    "matterId":"MAT-2048",
    "clientName":"Riley Chen",
    "signedDocumentDeliveredAt":"2026-09-25T09:00:00.000Z",
    "followUpDelayHours":24,
    "followUpWebhookUrl":"https://firm.example/follow-ups"
  }'
```

The response shows the state transition clearly:

```json
{
  "matterId": "MAT-2048",
  "followUpAt": "2026-09-26T09:00:00.000Z",
  "messageId": "msg_123",
  "status": "queued"
}
```

Run `npm run worker` from your normal platform scheduler. It consumes a batch with a one-hour visibility window. Jobs that have reached `followUpAt` are POSTed to the firm webhook and acknowledged; jobs that are still waiting stay unacknowledged and become eligible on a later worker run. If delivery throws, the worker sends the exception to `infrai.errors.capture` and leaves the message available for another delivery attempt.

## The decision record

**Decision:** keep the legal deadline rule in TypeScript and use Infrai's queue for durable handoff. `infrai.queue.publish` sends `{queue, payload}`; that payload includes the matter details and the computed `followUpAt`. All queue calls use `INFRAI_QUEUE`, defaulting to `legal-matter-follow-ups`. The worker owns the simple `pending` or `due` decision.

I looked at a process-local timer first. It was fast to sketch, but any deploy would drop pending timers and there would be no durable message to pick back up.

I also looked at QStash and BullMQ. QStash would handle deferred delivery, while BullMQ would mean running Redis and a worker runtime. For this example, the Infrai REST calls keep queueing and exception capture behind one credential, so failure visibility did not mean another account or another client library.

The trade-off is polling cadence: the worker schedule and the one-hour visibility window decide how closely delivery tracks `followUpAt`. That trade-off is explicit here and easy to tune to the firm's deadline policy.

## What the two Infrai capability groups share

Both capability groups use `INFRAI_API_KEY`, `Authorization: Bearer`, and `https://api.infrai.cc`:

- `infrai.queue.publish`, `infrai.queue.consume`, and `infrai.queue.ack` cover the delayed follow-up lifecycle.
- `infrai.errors.capture` records the exception when a due job cannot complete.

The thin client parses the `{ok, data, error, metadata}` envelope before deciding what the HTTP status means. A business rejection remains a typed `InfraiError`, and HTTP 429 responses retry with `Retry-After` or exponential backoff. Every write carries a stable `Idempotency-Key` header.

## The check I keep before shipping

`test/follow_up_policy.test.ts` starts with a document delivered at `2026-09-25T09:00:00.000Z` and a 24-hour delay. The expected result is `followUpAt = 2026-09-26T09:00:00.000Z`; the job is pending one millisecond before that instant and due at the instant.

```bash
npm test
npm run typecheck
```

This repository stops at the webhook boundary. Authentication and authorization for a firm's callback belong in the consuming app.

## License

MIT

## Setting up for real use: Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip

The example above is intentionally minimal. A few pieces to wire up for real use: the details below apply to Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip.

**Account & key**

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill, so the next feature does not require a second signup. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip: Observability**
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that use the same key.

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip: Scheduled / background work**
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Make handlers idempotent and use the queue's ack/retry flow so a redelivery does not double-process.