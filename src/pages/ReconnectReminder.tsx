import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RECONNECT_REMINDER_ENABLED } from "@/lib/reconnectReminder";

/** Red reconnect screen. Opened only from the reminder notification tap. Never changes availability. */
export default function ReconnectReminder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!RECONNECT_REMINDER_ENABLED) return <Navigate to="/home" replace />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-destructive px-6 text-center">
      <h1 className="text-2xl font-bold text-destructive-foreground">{t("Reconnect_Title")}</h1>
      <p className="mt-3 text-base text-destructive-foreground">{t("Reconnect_Body")}</p>
      <button
        className="mt-8 w-full max-w-sm rounded-xl bg-success py-4 text-lg font-bold text-success-foreground active:scale-[0.98] transition-transform"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("reconnect:ok"));
          navigate("/home", { replace: true });
        }}
      >
        {t("Reconnect_OK")}
      </button>
    </div>
  );
}
