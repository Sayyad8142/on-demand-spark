import i18n from './config';
import { useTranslation } from 'react-i18next';

/** Display-only translation. Never pass its result to an RPC, stored ID or parser. */
export function displayText(text: string, values?: Record<string, string | number>): string {
  const key = text.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return String(i18n.t(`worker.${key}`, { defaultValue: text, ...values }));
}

export function useWorkerLanguage() {
  // Subscribe even in screens whose display helpers live outside the component.
  useTranslation();
}

export function serviceLabel(value: string | null | undefined): string {
  if (value === 'maid' || value === 'Maid' || value === 'Maid Service') return String(i18n.t('auth.services.maid'));
  if (value === 'bathroom_cleaning' || value === 'Bathroom Cleaning') return String(i18n.t('auth.services.bathroom_cleaning'));
  return displayText('Service');
}

export function bookingStatusLabel(value: string): string {
  const aliases: Record<string, string> = { assigned: 'accepted', started: 'in_progress' };
  const status = aliases[value] ?? value;
  return String(i18n.t(`bookings.status.${status}`, { defaultValue: displayText('Pending') }));
}

export function displayLocale(): string {
  return `${i18n.resolvedLanguage === 'hi' ? 'hi' : i18n.resolvedLanguage === 'te' ? 'te' : 'en'}-IN`;
}