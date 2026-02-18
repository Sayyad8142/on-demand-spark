import { PhoneCall } from "lucide-react";
import playstoreImg from "@/assets/playstore-update-instruction.png";

const ForceUpdateScreen = () => {
  const handleUpdateNow = () => {
    window.open(
      'https://play.google.com/store/apps/details?id=com.didinow.partner',
      '_blank'
    );
  };

  const handleCallManager = () => {
    window.open('tel:8008180018', '_self');
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start pt-16 pb-10 px-4"
      style={{
        background: 'linear-gradient(to bottom, #ff007a, #ff4da6)',
      }}
    >
      {/* Play Store Instruction Image */}
      <img
        src={playstoreImg}
        alt="Update on Play Store"
        className="rounded-2xl shadow-lg"
        style={{ width: '85%', borderRadius: '16px' }}
      />

      {/* Spacer */}
      <div className="flex-1 min-h-8" />

      {/* Update Now Button */}
      <button
        onClick={handleUpdateNow}
        className="font-bold cursor-pointer active:scale-[0.97] transition-transform"
        style={{
          background: '#ffffff',
          color: '#ff007a',
          height: '56px',
          width: '90%',
          borderRadius: '14px',
          fontSize: '18px',
          fontWeight: 'bold',
          border: 'none',
        }}
      >
        Update Now
      </button>

      {/* Call Manager Button */}
      <button
        onClick={handleCallManager}
        className="flex items-center justify-center gap-2 font-bold cursor-pointer active:scale-[0.97] transition-transform mt-4"
        style={{
          background: 'linear-gradient(to bottom, #16a34a, #22c55e)',
          color: '#ffffff',
          height: '56px',
          width: '90%',
          borderRadius: '14px',
          fontSize: '18px',
          fontWeight: 'bold',
          border: 'none',
        }}
      >
        <PhoneCall className="w-5 h-5" />
        Call Manager
      </button>
    </div>
  );
};

export default ForceUpdateScreen;
