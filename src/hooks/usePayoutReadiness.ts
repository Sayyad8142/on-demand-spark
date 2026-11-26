import { useQuery } from "@tanstack/react-query";
import { readPayoutReadinessFromServer, readinessAllowsBookings, type PayoutReadiness } from "@/lib/payoutBookingGate";

/** Server payout readiness for the signed-in worker; account-keyed, refreshed on focus. */
export function usePayoutReadiness(accountId: string | null | undefined, legacyPayoutReady: unknown) {
  const query = useQuery<PayoutReadiness | null>({
    queryKey: ["payout-readiness", accountId ?? "none"],
    queryFn: readPayoutReadinessFromServer,
    enabled: !!accountId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const readiness = query.data ?? null;
  return {
    readiness,
    loading: query.isLoading,
    allowsBookings: readinessAllowsBookings(readiness, legacyPayoutReady),
    refetch: query.refetch,
  };
}
