/**
 * Worker bank-setup completion status.
 *
 * Single source of truth used by:
 *  - The full-screen IncompleteBankSetup guard (App.tsx)
 *  - The OnboardingChecklist "Add bank account details" step
 *
 * A worker is considered "bank setup complete" when ALL three primary fields
 * exist on the workers row:
 *   - account_holder_name
 *   - bank_account_number
 *   - ifsc_code
 *
 * `payout_ready` is only set to true once these are filled (see
 * AccountDetails.tsx Save handler), so it stays consistent with this check.
 */
export interface BankSetupStatus {
  hasBankDetails: boolean;
  isComplete: boolean;
}

export function getBankSetupStatus(worker: any): BankSetupStatus {
  const hasBankDetails = !!(
    worker?.account_holder_name &&
    worker?.bank_account_number &&
    worker?.ifsc_code
  );
  return {
    hasBankDetails,
    isComplete: hasBankDetails,
  };
}
