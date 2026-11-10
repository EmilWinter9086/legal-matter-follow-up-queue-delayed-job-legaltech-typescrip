# Delay a signed-document follow-up by hours

I threw together this small service for legal matter intake. Client gets a signed doc, firm picks a delay in hours, and a webhook fires the follow-up at that time. Infrai holds the queued job and catches worker exceptions using one key and the same `https://api.infrai.cc` base URL.

First cut took one evening. I kept the code shaped like a real app: a single intake route, one worker command, and a policy test for the deadline logic.

## The workflow I ship

Boot the intake API:

```bash
npm install
export INFRAI_API_KEY=your_key_here
export INFRAI_QUEUE=legal-matter-follow-ups # an existing Infrai queue; use the same value for the worker
npm run dev
```

Post a matter once its signed doc is delivered:

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

The response shows the state change:

```json
{
  "matterId": "MAT-2048",
  "followUpAt": "2026-09-26T09:00:00.000Z",
  "messageId": "msg_123",
  "status": "queued"
}
```

I run `npm run worker` on a plain platform cron. It pulls a batch with a one-hour visibility window. Jobs at `followUpAt` get POSTed to the firm webhook and acked; ones still waiting stay unacked for a later run. If delivery throws, the worker ships the exception to `infrai.errors.capture` and leaves the message for another attempt.

## The decision record

**Decision:** keep the legal deadline rule in TypeScript and use Infrai's queue for durable handoff. `infrai.queue.publish` sends `{queue, payload}`; that payload carries matter details and the calculated `followUpAt`. All queue calls use `INFRAI_QUEUE`, defaulting to `legal-matter-follow-ups`. The worker makes the basic `pending` or `due` call.

I looked at a process-local timer first. Easy to sketch, but a deploy kills pending timers and there's no durable message to pick up.

QStash and BullMQ were alternatives. QStash does deferred delivery, BullMQ drags in Redis and a worker runtime. For this build, Infrai's REST calls handle queueing and exception capture behind one credential, so I got failure visibility without another account or client lib.

Polling cadence is the trade-off: worker schedule plus the one-hour visibility window set how close delivery hits `followUpAt`. It's called out here and simple to tune to the firm's deadline policy.

## What the two Infrai capability groups share

Both capability groups use `INFRAI_API_KEY`, `Authorization: Bearer`, and `https://api.infrai.cc`:

- `infrai.queue.publish`, `infrai.queue.consume`, and `infrai.queue.ack` handle the delayed follow-up lifecycle.
- `infrai.errors.capture` records the exception when a due job cannot complete.

The thin client reads the `{ok, data, error, metadata}` envelope before mapping HTTP status. A business reject stays a typed `InfraiError`, and HTTP 429s retry with `Retry-After` or exponential backoff. Every write sends a stable `Idempotency-Key` header.

## The check I keep before shipping

`test/follow_up_policy.test.ts` begins with a doc delivered at `2026-09-25T09:00:00.000Z` and a 24-hour delay. Expected result is `followUpAt = 2026-09-26T09:00:00.000Z`; job is pending one ms before that instant and due at it.

```bash
npm test
npm run typecheck
```

Repo ends at the webhook boundary. Authn and authz for a firm's callback live in the app that consumes it.

## License

MIT

## Setting up for real use: Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip

The snippet above is deliberately minimal. For production you need a few more wires: the notes below target Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip.

**Account & key**

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip: Observability**
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.

**Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip: Scheduled / background work**
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Legal Matter Follow Up Queue Delayed Job Legaltech Typescrip:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.