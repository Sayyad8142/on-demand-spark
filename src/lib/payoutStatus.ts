import { Clock, CheckCircle2, AlertTriangle, XCircle, RotateCcw, type LucideIcon } from "lucide-react";

export interface PayoutStatusConfig {
  label: string;
  badgeClass: string;
  icon: LucideIcon;
  /** Which summary bucket this status falls into */
  bucket: "pending" | "paid" | "held" | "failed";
}

const STATUS_MAP: Record<string, PayoutStatusConfig> = {
  pending:    { label: "Pending Review",      badgeClass: "bg-amber-100 text-amber-700",   icon: Clock,          bucket: "pending" },
  approved:   { label: "Approved",            badgeClass: "bg-blue-100 text-blue-700",     icon: Clock,          bucket: "pending" },
  processing: { label: "Processing Payment",  badgeClass: "bg-purple-100 text-purple-700", icon: Clock,          bucket: "pending" },
  paid:       { label: "Paid to You",         badgeClass: "bg-green-100 text-green-700",   icon: CheckCircle2,   bucket: "paid" },
  held:       { label: "On Hold",             badgeClass: "bg-orange-100 text-orange-700", icon: AlertTriangle,  bucket: "held" },
  failed:     { label: "Payment Failed",      badgeClass: "bg-red-100 text-red-700",       icon: XCircle,        bucket: "failed" },
  reversed:   { label: "Reversed",            badgeClass: "bg-red-100 text-red-700",       icon: RotateCcw,      bucket: "failed" },
};

const FALLBACK: PayoutStatusConfig = STATUS_MAP.pending;

/** Get worker-friendly payout status config */
export function getPayoutStatus(status: string | null | undefined): PayoutStatusConfig {
  if (!status) return FALLBACK;
  return STATUS_MAP[status] ?? FALLBACK;
}

/** Label shown when a completed booking has no payout record yet */
export const PAYOUT_ESTIMATING_LABEL = "Payout Pending";
