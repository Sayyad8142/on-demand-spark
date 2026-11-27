import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import te from './locales/te.json';
import { bankOnboardingMessages } from './bankOnboardingMessages';
import { bankSelfServiceMessages } from './bankSelfServiceMessages';
import { serviceTrainingMessages } from './serviceTrainingMessages';
import { servicePricingMessages } from './servicePricingMessages';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const supported = ['en', 'hi', 'te'];
const saved = localStorage.getItem('language');

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, worker: { ...en.worker, ...serviceTrainingMessages.en, ...servicePricingMessages.en, ...bankOnboardingMessages.en, ...bankSelfServiceMessages.en, App_Update_Required: 'App Update Required', Call_Support: 'Call Support' } } },
      hi: { translation: { ...hi, worker: { ...hi.worker, ...serviceTrainingMessages.hi, ...servicePricingMessages.hi, ...bankOnboardingMessages.hi, ...bankSelfServiceMessages.hi, App_Update_Required: 'ऐप अपडेट ज़रूरी है', Call_Support: 'सहायता के लिए कॉल करें' } } },
      te: { translation: { ...te, worker: { ...te.worker, ...serviceTrainingMessages.te, ...servicePricingMessages.te, ...bankOnboardingMessages.te, ...bankSelfServiceMessages.te, App_Update_Required: 'యాప్ అప్‌డేట్ అవసరం', Call_Support: 'సహాయం కోసం కాల్ చేయండి' } } }
    },
    lng: saved && supported.includes(saved) ? saved : 'en',
    supportedLngs: supported,
    returnNull: false,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

i18n.on('languageChanged', (language) => {
  const code = supported.includes(language) ? language : 'en';
  localStorage.setItem('language', code);
  document.documentElement.lang = code;
  if (Capacitor.isNativePlatform()) void Preferences.set({ key: 'worker_language', value: code }).catch(() => {});
});
document.documentElement.lang = i18n.language;

/** Restore durable native preference before rendering the first screen. */
export async function restoreWorkerLanguage() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { value } = await Preferences.get({ key: 'worker_language' });
    if (value && supported.includes(value)) await i18n.changeLanguage(value);
  } catch { /* The local preference remains usable when native storage is unavailable. */ }
}

export default i18n;
