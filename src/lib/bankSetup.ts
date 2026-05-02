/**
 * Worker payout-setup completion status.
 *
 * Single source of truth used by:
 *  - Signup flow (UPI is required, bank optional)
 *  - The OnboardingChecklist "Add payout details" step
 *
 * A worker is considered "payout setup complete" when they have a valid UPI ID,
 * OR a complete set of bank details. UPI is the primary, required payout method
 * during signup; bank details are optional.
 */
export interface BankSetupStatus {
  hasBankDetails: boolean;
  hasUpi: boolean;
  isComplete: boolean;
}

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

export function getBankSetupStatus(worker: any): BankSetupStatus {
  const hasBankDetails = !!(
    worker?.account_holder_name &&
    worker?.bank_account_number &&
    worker?.ifsc_code
  );
  const upi = String(worker?.upi_id || "").trim();
  const hasUpi = !!upi && UPI_REGEX.test(upi);
  return {
    hasBankDetails,
    hasUpi,
    isComplete: hasUpi || hasBankDetails,
  };
}
