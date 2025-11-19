import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface HeaderProps {
  workerName?: string;
  communityName?: string;
}

export default function Header({ workerName, communityName }: HeaderProps) {
  const navigate = useNavigate();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';

  const handleExitGuest = () => {
    localStorage.removeItem('guest_mode');
    navigate('/auth');
  };

  return (
    <header className="bg-primary text-primary-foreground px-4 py-2 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Didi Now</h1>
          {isGuestMode ? (
            <p className="text-xs opacity-90 bg-yellow-500/20 px-2 py-0.5 rounded-full inline-block">
              Guest Mode
            </p>
          ) : (
            workerName && <p className="text-xs opacity-90">{workerName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isGuestMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitGuest}
              className="h-8 text-xs text-primary-foreground hover:bg-primary-foreground/10"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Exit
            </Button>
          )}
          {communityName && !isGuestMode && (
            <div className="text-right">
              <p className="text-xs opacity-75">{communityName}</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
