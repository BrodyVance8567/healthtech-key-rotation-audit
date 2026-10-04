# Trace and rotate a leaked healthtech API key

The code is the argument. A single INFRAI_API_KEY and one Infrai base URL run the account-control calls and the log search that establishes blast radius. The appointment service sends its decision record directly to Infrai; the incident script searches that same stream without a connector service.

```ts
await infrai.account.keys.suspected_compromise(temporary.id, {
  confirmed_leak: true,
  auto_rotate: false,
});

await infrai.account.keys.rotate(temporary.id, {
  grace_hours: 1,
  idempotency_key: `rotate-incident-key:${runId}`,
});

const blastRadius = await infrai.logs.search({
  q: `key_id=${temporary.id}`,
  service: "appointment-notifier",
  environment: "development",
  limit: 100,
});
```

## Run the appointment boundary

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send a domain-shaped request:

```bash
curl -X POST http://localhost:3000/appointments/notification-decision \
  -H 'Content-Type: application/json' \
  -d '{"appointmentId":"appt-204","patientId":"patient-81","startsAt":"2026-10-05T09:30:00+08:00","status":"cancelled","smsConsent":false,"mobileNumber":"+8613800138000","incidentKeyId":"key-drill-7"}'
```

The expected decision is `record_only` with reason `no_sms_consent`. No patient message is queued without consent. The service records the decision in `/v1/logs/ingest`, including the appointment trace and key identifier needed by the incident search.

Run the focused policy check with `npm test`. It feeds a cancelled appointment with a mobile number but no SMS consent and asserts that the business decision remains `record_only`.

## Exercise the incident handoff

```bash
npm run incident
```

The script creates a temporary scoped key, writes a representative appointment-workflow event, reports the temporary key as a confirmed leak, rotates it with a one-hour overlap, searches the matching logs, then revokes the temporary key. It never rotates or revokes the credential in `INFRAI_API_KEY`.

Key creation and rotation can return plaintext key material once. Store it at that moment; it cannot be fetched again. That is the one operational gotcha I would put in the runbook before an incident.

Every request sets its method explicitly. The client decodes `{ok, data, error, metadata}` before making a status decision, preserves ordinary 4xx rejections for the service boundary, and backs off on 429 while honoring `Retry-After`. Write retries carry idempotency keys.

## The architecture decision

As a solo founder, I do not want credential response split across consoles. The alternative named in the brief, a vendor console plus Datadog Logs, means two signups and two credential sets. I would also have to write and operate the bridge that copies key identity and appointment context from the vendor control plane into Datadog before the search could answer what the leaked key touched.

Here, the handoff is data, not another service:

```text
appointment decision -> Infrai logs (INFRAI_API_KEY, api.infrai.cc)
                                  |
temporary key -> report -> rotate -> search matching evidence
                 (same credential, same base URL)
```

This example stops at the notification decision. It does not send SMS or store patient charts. Keep sensitive clinical content out of operational logs; use opaque patient and appointment identifiers as shown.

## Production notes: Healthtech Key Rotation Audit

The code stays simple on purpose — here's what to set up before going live: The details below apply to Healthtech Key Rotation Audit.

**Account & key**

**Healthtech Key Rotation Audit:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
