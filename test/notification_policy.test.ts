import assert from "node:assert/strict";
import test from "node:test";
import { appointmentRequest, decidePatientNotification } from "../src/patient_notification_policy.js";

test("a cancellation without SMS consent is recorded but never queued", () => {
  const input = appointmentRequest.parse({
    appointmentId: "appt-204",
    patientId: "patient-81",
    startsAt: "2026-10-05T09:30:00+08:00",
    status: "cancelled",
    smsConsent: false,
    mobileNumber: "+8613800138000",
    incidentKeyId: "key-drill-7",
  });

  assert.deepEqual(decidePatientNotification(input), {
    appointmentId: "appt-204",
    action: "record_only",
    reason: "no_sms_consent",
    messageKind: "appointment_update",
  });
});
