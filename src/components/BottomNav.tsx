import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, User, Clock, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [hasAvailability, setHasAvailability] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase.
        from("worker_availability").
        select("slots").
        eq("worker_id", user.id);

        if (error) throw error;

        // Check if any day has at least one slot selected
        const hasSlots = data?.some((day) =>
        Array.isArray(day.slots) && day.slots.length > 0
        );

        setHasAvailability(!!hasSlots);
      } catch (error) {
        console.error("Error checking availability:", error);
      }
    };

    checkAvailability();
  }, [user]);

  const navItems = [
  { path: "/home", icon: Home, label: t('nav.home') },
  { path: "/bookings", icon: Calendar, label: t('nav.bookings') },
  { path: "tel:8008180018", icon: Phone, label: "Call", isExternal: true },
  { path: "/availability", icon: Clock, label: t('nav.availability'), showBadge: hasAvailability },
  { path: "/profile", icon: User, label: t('nav.profile') }];


  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 safe-area-pb">
      <div className="flex justify-around items-end h-[72px] max-w-md mx-auto pb-2">
        {navItems.map(({ path, icon: Icon, label, showBadge, isExternal }) => {
          const isCallButton = path.startsWith('tel:');
          const active = isActive(path);

          if (isCallButton) {
            return (
              <button
                key={path}
                onClick={() => window.location.href = path}
                className="flex flex-col items-center justify-end flex-1 h-full relative -top-3"
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-[0_4px_16px_hsl(330_100%_50%_/_0.35)] ring-4 ring-background transition-transform active:scale-95">
                    <Phone className="w-6 h-6 text-primary-foreground stroke-[2.5]" />
                  </div>
                  {showBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background" />
                  )}
                </div>
                <span className="text-[10px] mt-1 font-semibold text-primary">{label}</span>
              </button>
            );
          }

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-end flex-1 h-full pb-1 transition-colors relative ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`w-6 h-6 ${active ? "stroke-[2.5]" : ""}`} />
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-background" />
                )}
              </div>
              <span className="text-[10px] mt-1 font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}