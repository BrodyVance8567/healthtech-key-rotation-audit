import { randomUUID } from "node:crypto";
import { clientFromEnvironment } from "./infrai_incident_client.js";

const infrai = clientFromEnvironment();
const runId = randomUUID();

const temporary = await infrai.account.keys.create({
  name: `healthtech-incident-drill-${runId}`,
  scopes: ["logs"],
  idempotency_key: `create-incident-key:${runId}`,
});

console.log(`Created temporary key ${temporary.key_id}. Store its plaintext now; it cannot be retrieved a second time.`);

await infrai.logs.ingest({
  entries: [{
    timestamp: new Date().toISOString(),
    level: "info",
    service: "appointment-notifier",
    environment: process.env.NODE_ENV ?? "development",
    trace_id: runId,
    message: `incident_drill key_id=${temporary.key_id} appointment_workflow=notification-decision`,
  }],
  idempotency_key: `incident-evidence:${runId}`,
});

await infrai.account.keys.suspected_compromise(temporary.key_id, {
  confirmed_leak: true,
  auto_rotate: false,
});

const rotated = await infrai.account.keys.rotate(temporary.key_id, {
  grace_hours: 1,
  idempotency_key: `rotate-incident-key:${runId}`,
});
console.log("Rotation returned new plaintext key material. Store it now; it cannot be retrieved a second time.");

const blastRadius = await infrai.logs.search({
  q: `key_id=${temporary.key_id}`,
  service: "appointment-notifier",
  environment: process.env.NODE_ENV ?? "development",
  limit: 100,
});

console.log("Blast-radius evidence:", JSON.stringify(blastRadius, null, 2));
const rotatedKeyId = `${rotated.key.slice(0, 4)}...${rotated.key.slice(-4)}`;
await infrai.account.keys.revoke(rotatedKeyId);
await infrai.account.keys.revoke(temporary.key_id);
console.log(`Revoked temporary drill keys ${temporary.key_id} and ${rotatedKeyId}; INFRAI_API_KEY was never rotated or revoked.`);
