import { describe, expect, it } from 'vitest';
import i18n from '../config';
import { serviceLabel, bookingStatusLabel } from '../display';

describe('worker display localization boundaries', () => {
  it('displays Hindi services without changing service codes', async () => {
    await i18n.changeLanguage('hi');
    const service = 'maid';
    expect(serviceLabel(service)).toBe('घरेलू काम');
    expect(serviceLabel('bathroom_cleaning')).toBe('बाथरूम की सफाई');
    expect(service).toBe('maid');
  });
  it('displays Telugu services', async () => {
    await i18n.changeLanguage('te');
    expect(serviceLabel('maid')).toBe('ఇంటి పని');
    expect(serviceLabel('bathroom_cleaning')).toBe('బాత్రూమ్ శుభ్రపరచడం');
  });
  it('persists the selected language and changes only status display', async () => {
    await i18n.changeLanguage('hi');
    expect(localStorage.getItem('language')).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(bookingStatusLabel('assigned')).toBe('स्वीकृत');
    await i18n.changeLanguage('en');
  });
});