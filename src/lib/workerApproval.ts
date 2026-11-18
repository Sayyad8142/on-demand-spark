// Display-only. The shared backend remains authoritative for all mutations.
export function workerApproved(worker: { approval_status?: string | null } | null | undefined): boolean {
  return worker?.approval_status === "approved";
}
export const APPROVAL_WAIT_MESSAGE = "Waiting for Admin Approval. You can start receiving bookings once your account is approved.";