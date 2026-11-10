import { z } from "zod";
import { classifyFollowUp, followUpJobSchema } from "./follow_up_policy";
import { infrai } from "./infrai";

const queuedMessageSchema = z.object({
  message_id: z.string().min(1),
  payload: z.unknown(),
});

async function deliverSignedDocumentFollowUp(
  job: z.infer<typeof followUpJobSchema>,
): Promise<void> {
  const response = await fetch(job.followUpWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matterId: job.matterId,
      clientName: job.clientName,
      action: "review_signed_document",
      signedDocumentDeliveredAt: job.signedDocumentDeliveredAt,
    }),
  });
  if (!response.ok) throw new Error(`Follow-up webhook returned ${response.status}`);
}

async function run(): Promise<void> {
  const batch = await infrai.queue.consume();

  for (const rawMessage of batch.items) {
    let messageId = "unknown";
    try {
      const message = queuedMessageSchema.parse(rawMessage);
      messageId = message.message_id;
      const job = followUpJobSchema.parse(message.payload);
      if (classifyFollowUp(job, new Date()) === "pending") continue;

      await deliverSignedDocumentFollowUp(job);
      await infrai.queue.ack(message.message_id);
      console.log(JSON.stringify({ matterId: job.matterId, status: "follow_up_delivered" }));
    } catch (error) {
      const exception = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack, messageId }
        : { name: "UnknownError", message: String(error), messageId };
      await infrai.errors.capture(exception, `follow-up-error:${messageId}`);
    }
  }
}

await run();
