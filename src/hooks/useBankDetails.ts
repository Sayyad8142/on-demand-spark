import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { readMyBankDetails, type BankDetails } from "@/lib/bankSelfService";

/** Worker's own bank status from Admin; refreshed whenever a screen using it opens. Display only. */
export function useBankDetails(accountId: string | null | undefined) {
  const query = useQuery<BankDetails | null>({
    queryKey: ["my-bank-details", accountId ?? "none"],
    queryFn: () => readMyBankDetails(),
    enabled: !!accountId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // While Cashfree registration is still running, re-check so "Registered" appears without reopening.
    refetchInterval: (q) => (q.state.data?.setup === "saved" || q.state.data?.setup === "review" ? 60_000 : false),
  });
  const { refetch } = query;
  useEffect(() => {
    if (!accountId || !Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => { if (isActive && !disposed) void refetch(); }).then((listener) => {
      if (disposed) void listener.remove();
      else remove = () => { void listener.remove(); };
    });
    return () => { disposed = true; remove?.(); };
  }, [accountId, refetch]);
  return { bank: query.data ?? null, loading: query.isLoading, refetch: query.refetch };
}