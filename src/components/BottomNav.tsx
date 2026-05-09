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
      <div className="flex justify-around items-end h-16 max-w-md mx-auto px-1">
        {navItems.map(({ path, icon: Icon, label, isExternal }) => {
          const isCallButton = path.startsWith('tel:');
          const active = isActive(path);

          if (isCallButton) {
            return (
              <button
                key={path}
                onClick={() => (window.location.href = path)}
                aria-label="Call support"
                className="flex flex-col items-center justify-center flex-1 h-full group focus:outline-none"
              >
                <div
                  className="-mt-7 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-[#16C75A]/40 ring-4 ring-background transition-all duration-150 active:scale-95 group-hover:brightness-110"
                  style={{ backgroundColor: '#16C75A' }}
                >
                  <Phone className="w-6 h-6 fill-white" strokeWidth={2.5} />
                </div>
              </button>
            );
          }

          return (
            <button
              key={path}
              onClick={() => (isExternal ? (window.location.href = path) : navigate(path))}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative active:scale-95 ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className="text-xs mt-1 font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
