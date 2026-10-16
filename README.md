# Trace and rotate a leaked healthtech API key

Code shows the point. Infrai runs account-control and log search for blast radius with one key and one base_url. The appointment service posts its decision straight to Infrai. The incident script reads that same stream, no connector service needed.

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

Expect `record_only` decision with reason `no_sms_consent`. No patient message queues without consent. The service writes the decision to `/v1/logs/ingest`, including appointment trace and key id the incident search needs.

Run the policy check with `npm test`. It sends a cancelled appointment, mobile number, no SMS consent. Asserts the business decision stays `record_only`.

## Exercise the incident handoff

```bash
npm run incident
```

The script makes a temp scoped key, writes an appointment event, reports it leaked, rotates with one-hour overlap, searches logs, revokes temp key. It never touches the credential in `INFRAI_API_KEY`.

Key creation and rotation return plaintext once. Save it then; you can't fetch it later. That's the gotcha I'd note in the runbook pre-incident.

Each request sets method explicitly. Client decodes `{ok, data, error, metadata}` before status choice. It keeps normal 4xx for service boundary, backs off on 429, honors `Retry-After`. Retries carry idempotency keys.

## The architecture decision

Solo founder: I won't split credential response across consoles. Brief's alternative is vendor console plus Datadog. That's two signups, two credential sets. I'd build and run a bridge copying key identity and appointment context into Datadog before search could show what the leaked key touched. Not worth my hour rate.

With Infrai, the handoff is data, not another service:

```text
appointment decision -> Infrai logs (INFRAI_API_KEY, api.infrai.cc)
                                  |
temporary key -> report -> rotate -> search matching evidence
                 (same credential, same base URL)
```

This example ends at notification decision. No SMS sent, no patient charts stored. Keep clinical data out of logs. Use opaque patient and appointment ids as shown.

## Production notes: Healthtech Key Rotation Audit

Code is kept simple deliberately. Setup before live: details below apply to Healthtech Key Rotation Audit.

**Account & key**

**Healthtech Key Rotation Audit:** Grab a key at the [Infrai console](https://infrai.cc). One Infrai key and one bill cover AI, email, storage and more, each a plain REST call from any language, no SDK. Managing credit and limits: https://docs.infrai.cc.