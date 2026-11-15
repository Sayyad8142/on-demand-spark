import i18n from "./config";

const messages = {
  en: {
    Next_Booking_is_not_enabled_yet: "Next Booking is not enabled yet.",
    Ranking_service_is_not_available_yet: "Ranking service is not available yet.",
    Could_not_connect_Try_again: "Could not connect. Try again.",
    Ranking_data_could_not_be_verified_Try_again: "Ranking data could not be verified. Try again.",
    Turn_on_availability_to_appear_in_this_ranking: "Turn on availability to appear in this ranking.",
    You_have_no_saved_working_hours_for_this_slot: "You have no saved working hours for this slot.",
    You_are_busy_with_a_booking: "You are busy with a booking.",
    Your_worker_account_is_inactive: "Your worker account is inactive.",
  },
  hi: {
    Next_Booking_is_not_enabled_yet: "अगली बुकिंग की रैंकिंग अभी चालू नहीं है।",
    Ranking_service_is_not_available_yet: "रैंकिंग सेवा अभी उपलब्ध नहीं है।",
    Could_not_connect_Try_again: "कनेक्शन नहीं हो सका। फिर कोशिश करें।",
    Ranking_data_could_not_be_verified_Try_again: "रैंकिंग की जाँच नहीं हो सकी। फिर कोशिश करें।",
    Turn_on_availability_to_appear_in_this_ranking: "इस रैंकिंग में आने के लिए उपलब्धता चालू करें।",
    You_have_no_saved_working_hours_for_this_slot: "इस समय के लिए आपके काम के घंटे सेव नहीं हैं।",
    You_are_busy_with_a_booking: "आप अभी एक बुकिंग में व्यस्त हैं।",
    Your_worker_account_is_inactive: "आपका वर्कर खाता सक्रिय नहीं है।",
  },
  te: {
    Next_Booking_is_not_enabled_yet: "తదుపరి బుకింగ్ ర్యాంకింగ్ ఇంకా ప్రారంభించలేదు.",
    Ranking_service_is_not_available_yet: "ర్యాంకింగ్ సేవ ఇంకా అందుబాటులో లేదు.",
    Could_not_connect_Try_again: "కనెక్ట్ కాలేకపోయాము. మళ్లీ ప్రయత్నించండి.",
    Ranking_data_could_not_be_verified_Try_again: "ర్యాంకింగ్ వివరాలను ధృవీకరించలేకపోయాము. మళ్లీ ప్రయత్నించండి.",
    Turn_on_availability_to_appear_in_this_ranking: "ఈ ర్యాంకింగ్‌లో కనిపించడానికి అందుబాటును ఆన్ చేయండి.",
    You_have_no_saved_working_hours_for_this_slot: "ఈ స్లాట్‌కు మీ పని గంటలు సేవ్ చేయలేదు.",
    You_are_busy_with_a_booking: "మీరు ఒక బుకింగ్ పనిలో ఉన్నారు.",
    Your_worker_account_is_inactive: "మీ వర్కర్ ఖాతా సక్రియంగా లేదు.",
  },
};

for (const [language, worker] of Object.entries(messages)) {
  i18n.addResourceBundle(language, "translation", { worker }, true, true);
}