import assert from "node:assert/strict";
import test from "node:test";
import { classifyFollowUp, matterIntakeSchema, planFollowUp } from "../src/follow_up_policy";

test("a signed document waits the chosen number of hours", () => {
  const intake = matterIntakeSchema.parse({
    matterId: "MAT-2048",
    clientName: "Riley Chen",
    signedDocumentDeliveredAt: "2026-09-25T09:00:00.000Z",
    followUpDelayHours: 24,
    followUpWebhookUrl: "https://firm.example/follow-ups",
  });

  const job = planFollowUp(intake);

  assert.equal(job.followUpAt, "2026-09-26T09:00:00.000Z");
  assert.equal(classifyFollowUp(job, new Date("2026-09-26T08:59:59.999Z")), "pending");
  assert.equal(classifyFollowUp(job, new Date("2026-09-26T09:00:00.000Z")), "due");
});
