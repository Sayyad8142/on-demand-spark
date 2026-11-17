import i18n from "./config";

const messages = {
  en: {
    Booking_alert_connection_needs_attention: "Booking alert connection needs attention",
    Notifications_are_allowed_Try_again_to_connect_booking_alerts: "Notifications are allowed. Try again to connect booking alerts.",
  },
  hi: {
    Booking_alert_connection_needs_attention: "बुकिंग अलर्ट का कनेक्शन ठीक करना है",
    Notifications_are_allowed_Try_again_to_connect_booking_alerts: "सूचनाओं की अनुमति है। बुकिंग अलर्ट जोड़ने के लिए फिर कोशिश करें।",
  },
  te: {
    Booking_alert_connection_needs_attention: "బుకింగ్ అలర్ట్ కనెక్షన్‌ను సరిచేయాలి",
    Notifications_are_allowed_Try_again_to_connect_booking_alerts: "నోటిఫికేషన్లకు అనుమతి ఉంది. బుకింగ్ అలర్ట్‌లను కనెక్ట్ చేయడానికి మళ్లీ ప్రయత్నించండి.",
  },
};
for (const [language, values] of Object.entries(messages)) {
  i18n.addResourceBundle(language, "translation", { worker: values }, true, true);
}