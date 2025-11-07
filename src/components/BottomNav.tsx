import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, User, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const navItems = [
    { path: "/home", icon: Home, label: t('nav.home') },
    { path: "/bookings", icon: Calendar, label: t('nav.bookings') },
    { path: "/availability", icon: Clock, label: t('nav.availability') },
    { path: "/profile", icon: User, label: t('nav.profile') },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              isActive(path)
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className={`w-6 h-6 ${isActive(path) ? "stroke-[2.5]" : ""}`} />
            <span className="text-xs mt-1 font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
