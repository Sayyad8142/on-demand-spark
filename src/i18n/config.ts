import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import te from './locales/te.json';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const supported = ['en', 'hi', 'te'];
const saved = localStorage.getItem('language');

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      te: { translation: te }
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
