import { createServer } from "node:http";
import { ZodError } from "zod";
import { matterIntakeSchema, planFollowUp } from "./follow_up_policy";
import { InfraiError, infrai } from "./infrai";

const port = Number(process.env.PORT ?? 3000);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matters/intake") {
    reply(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const intake = matterIntakeSchema.parse(await readJson(request));
    const job = planFollowUp(intake);
    const published = await infrai.queue.publish(
      job,
      `matter-follow-up:${job.matterId}:${job.followUpAt}`,
    );
    reply(response, 202, {
      matterId: job.matterId,
      followUpAt: job.followUpAt,
      messageId: published.message_id,
      status: "queued",
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_matter_intake" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      reply(response, error.status, { error: error.code, message: error.message });
      return;
    }
    reply(response, 500, { error: "intake_failed" });
  }
}).listen(port, () => {
  console.log(`Matter intake listening on http://localhost:${port}`);
});
