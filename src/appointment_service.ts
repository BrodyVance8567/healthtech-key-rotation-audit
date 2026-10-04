import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, clientFromEnvironment } from "./infrai_incident_client.js";
import { appointmentRequest, decidePatientNotification } from "./patient_notification_policy.js";

const infrai = clientFromEnvironment();

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/appointments/notification-decision") {
    reply(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = appointmentRequest.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const decision = decidePatientNotification(input);

    await infrai.logs.ingest({
      entries: [{
        timestamp: new Date().toISOString(),
        level: "info",
        service: "appointment-notifier",
        environment: process.env.NODE_ENV ?? "development",
        trace_id: input.appointmentId,
        message: `appointment_notification ${decision.action} key_id=${input.incidentKeyId}`,
      }],
      idempotency_key: `appointment-notification:${input.appointmentId}:${input.status}`,
    });

    reply(response, 200, decision);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code });
      return;
    }
    reply(response, 500, { error: "service_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Appointment decision service listening on http://localhost:${port}`));
