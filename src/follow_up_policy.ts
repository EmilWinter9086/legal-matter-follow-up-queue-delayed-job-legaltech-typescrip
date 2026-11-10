import { z } from "zod";

export const matterIntakeSchema = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  signedDocumentDeliveredAt: z.string().datetime({ offset: true }),
  followUpDelayHours: z.number().int().min(1).max(168),
  followUpWebhookUrl: z.string().url(),
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;

export const followUpJobSchema = matterIntakeSchema.extend({
  followUpAt: z.string().datetime(),
});

export type FollowUpJob = z.infer<typeof followUpJobSchema>;

export function planFollowUp(input: MatterIntake): FollowUpJob {
  const deliveredAt = new Date(input.signedDocumentDeliveredAt);
  const followUpAt = new Date(deliveredAt.getTime() + input.followUpDelayHours * 3_600_000);
  return { ...input, followUpAt: followUpAt.toISOString() };
}

export function classifyFollowUp(
  job: FollowUpJob,
  now: Date,
): "pending" | "due" {
  return now.getTime() >= Date.parse(job.followUpAt) ? "due" : "pending";
}
