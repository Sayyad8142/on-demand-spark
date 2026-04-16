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
  { path: "tel:8008180018", icon: Phone, label: "Call", isExternal: true },
  { path: "/bookings", icon: Calendar, label: t('nav.bookings') },
  { path: "/availability", icon: Clock, label: t('nav.availability'), showBadge: hasAvailability },
  { path: "/profile", icon: User, label: t('nav.profile') }];


  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map(({ path, icon: Icon, label, showBadge, isExternal }) => {
          const isCallButton = path.startsWith('tel:');
          return (
            <button
              key={path}
              onClick={() => isExternal ? window.location.href = path : navigate(path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
                isCallButton
                  ? "bg-success text-white hover:bg-success/90 mx-2 rounded-2xl"
                  : isActive(path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon className={`w-6 h-6 ${isActive(path) ? "stroke-[2.5]" : ""}`} />
                {showBadge}
              </div>
              <span className="text-xs mt-1 font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>);

}