import { z } from "zod";

export const appointmentRequest = z.object({
  appointmentId: z.string().min(1),
  patientId: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  status: z.enum(["scheduled", "rescheduled", "cancelled"]),
  smsConsent: z.boolean(),
  mobileNumber: z.string().min(7).optional(),
  incidentKeyId: z.string().min(1),
}).strict();

export type AppointmentRequest = z.infer<typeof appointmentRequest>;

export type NotificationDecision = {
  appointmentId: string;
  action: "queue_sms" | "record_only";
  reason: "patient_consented" | "no_sms_consent" | "missing_mobile_number";
  messageKind: "appointment_update";
};

export function decidePatientNotification(input: AppointmentRequest): NotificationDecision {
  if (!input.smsConsent) {
    return { appointmentId: input.appointmentId, action: "record_only", reason: "no_sms_consent", messageKind: "appointment_update" };
  }
  if (!input.mobileNumber) {
    return { appointmentId: input.appointmentId, action: "record_only", reason: "missing_mobile_number", messageKind: "appointment_update" };
  }
  return { appointmentId: input.appointmentId, action: "queue_sms", reason: "patient_consented", messageKind: "appointment_update" };
}
