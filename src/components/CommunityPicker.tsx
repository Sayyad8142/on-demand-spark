import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface CommunityOption {
  name: string;
  value: string;
}

interface CommunityPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Notifies the parent when the authoritative list changes (e.g. for name lookup). */
  onOptionsLoaded?: (options: CommunityOption[]) => void;
}

type LoadState = "loading" | "ready" | "error";

export function CommunityPicker({
  value,
  onChange,
  disabled,
  placeholder = "Select your community",
  onOptionsLoaded,
}: CommunityPickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CommunityOption[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const notify = useRef(onOptionsLoaded);
  notify.current = onOptionsLoaded;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const { data, error } = await supabase
        .from("communities")
        .select("name, value")
        .eq("is_active", true)
        .order("name");

      if (!mounted.current) return;
      if (error) throw error;

      const list = (data || []).filter((row): row is CommunityOption => !!row?.value && !!row?.name);
      setOptions(list);
      notify.current?.(list);
      setState(list.length > 0 ? "ready" : "error");
    } catch (err) {
      console.error("[CommunityPicker] load failed", err);
      if (mounted.current) setState("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Refresh silently when the app comes back to the foreground (Android resume).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && options.length === 0) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, options.length]);

  const selected = options.find((option) => option.value === value);
  const canOpen = !disabled && state !== "loading";

  return (
    <>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => (state === "error" ? load() : setOpen(true))}
        className={cn(
          "flex h-14 w-full items-center justify-between gap-3 rounded-2xl border-2 bg-background px-4 text-left text-base font-semibold transition-colors",
          open ? "border-primary" : "border-input",
          !canOpen && "opacity-60"
        )}
      >
        {state === "loading" ? (
          <span className="flex items-center gap-2 font-normal text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading communities…
          </span>
        ) : state === "error" ? (
          <span className="flex items-center gap-2 font-normal text-destructive">
            <RefreshCw className="h-4 w-4" /> Couldn’t load communities — tap to retry
          </span>
        ) : (
          <span className={cn("truncate", !selected && "font-normal text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
        )}
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-3xl p-0">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle className="text-lg">Select your community</SheetTitle>
          </SheetHeader>
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {options.length === 0 ? (
              <div className="space-y-3 p-4 text-center">
                <p className="text-sm text-muted-foreground">No communities available right now.</p>
                <Button variant="outline" onClick={() => load()} className="rounded-2xl">
                  Try again
                </Button>
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "mb-2 flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <span
                      className={cn(
                        "text-base font-semibold",
                        isSelected ? "text-primary" : "text-foreground"
                      )}
                    >
                      {option.name}
                    </span>
                    {isSelected && <Check className="h-5 w-5 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
