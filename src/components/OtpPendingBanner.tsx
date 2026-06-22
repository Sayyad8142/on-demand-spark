import { useLocation, useNavigate } from "react-router-dom";
import type { OtpPendingBooking } from "@/hooks/useOtpReminderEscalation";

/**
 * Persistent warning banner shown at the top of the app whenever the worker
 * has an accepted booking that has been pending OTP for more than 60 minutes.
 * Hidden on the Complete-Booking screen (where the OTP entry already lives).
 */
export default function OtpPendingBanner({ bookings }: { bookings: OtpPendingBooking[] }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!bookings || bookings.length === 0) return null;
  if (location.pathname.startsWith("/complete-booking/")) return null;

  // Show the most recent pending booking (typically only one).
  const target = bookings[0];

  return (
    <button
      type="button"
      onClick={() => navigate(`/complete-booking/${target.id}?focusOtp=1`)}
      className="fixed top-0 inset-x-0 z-[80] w-full bg-amber-500 text-amber-950 px-4 py-2.5 text-sm font-semibold text-left shadow-md active:bg-amber-600 flex items-center gap-2"
      aria-label="OTP pending – complete booking now"
    >
      <span className="text-lg leading-none">⚠</span>
      <span className="flex-1">OTP Pending – Complete booking now</span>
      <span className="text-xs font-bold underline">Open</span>
    </button>
  );
}
