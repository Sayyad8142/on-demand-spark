// Display-only mirror of the shared DB rule `worker_approval_allows_online`.
// The shared backend remains authoritative for all mutations and dispatch.
export interface WorkerApprovalFields {
  approval_status?: string | null;
  availability_requires_approval?: boolean | null;
}

export type ApprovalState = "approved" | "legacy_pending_review" | "pending" | "rejected" | "suspended";

export function approvalState(worker: WorkerApprovalFields | null | undefined): ApprovalState {
  const status = worker?.approval_status ?? "pending_approval";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "suspended") return "suspended";
  // Existing workers keep working under the legacy exemption until Admin reviews them.
  if (worker?.availability_requires_approval === false) return "legacy_pending_review";
  return "pending";
}

export function workerApproved(worker: WorkerApprovalFields | null | undefined): boolean {
  const s = approvalState(worker);
  return s === "approved" || s === "legacy_pending_review";
}

export const APPROVAL_WAIT_MESSAGE =
  "Waiting for Admin Approval. You can start receiving bookings once your account is approved.";
export const APPROVAL_REJECTED_MESSAGE = "Registration not approved. Please contact support.";
export const APPROVAL_GRANTED_MESSAGE = "Account approved. Turn ON to start receiving bookings.";
