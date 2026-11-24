import i18n from "./config";

const messages = {
  en: {
    Start_your_booking_within_10_minutes_to_avoid_losing_points_priority_points: "Start your booking within 10 minutes to avoid losing {{points}} priority points.",
    points_Priority_Points_Start_OTP_delayed: "−{{points}} Priority Points: Start OTP delayed.",
    Late_Start_OTP: "Late Start OTP",
    Start_OTP_delayed: "Start OTP delayed.",
  },
  hi: {
    Start_your_booking_within_10_minutes_to_avoid_losing_points_priority_points: "{{points}} प्रायोरिटी पॉइंट कटने से बचने के लिए 10 मिनट के अंदर अपनी बुकिंग शुरू करें।",
    points_Priority_Points_Start_OTP_delayed: "−{{points}} प्रायोरिटी पॉइंट: शुरू करने का OTP देर से डाला गया।",
    Late_Start_OTP: "शुरू करने के OTP में देरी",
    Start_OTP_delayed: "शुरू करने का OTP देर से डाला गया।",
  },
  te: {
    Start_your_booking_within_10_minutes_to_avoid_losing_points_priority_points: "{{points}} ప్రాధాన్యత పాయింట్లు కోల్పోకుండా 10 నిమిషాల్లో మీ బుకింగ్ ప్రారంభించండి.",
    points_Priority_Points_Start_OTP_delayed: "−{{points}} ప్రాధాన్యత పాయింట్లు: ప్రారంభ OTP ఆలస్యమైంది.",
    Late_Start_OTP: "ప్రారంభ OTP ఆలస్యం",
    Start_OTP_delayed: "ప్రారంభ OTP ఆలస్యమైంది.",
  },
};
for (const [lang, worker] of Object.entries(messages)) i18n.addResourceBundle(lang, "translation", { worker }, true, true);