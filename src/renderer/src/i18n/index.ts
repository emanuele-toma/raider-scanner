/**
 * i18n Configuration
 * Setup for react-i18next
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { LocalizedString } from '../../../shared/types';

// Import translations
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';

// Supported languages for the app UI
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'kr', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Game languages that arcraiders-data supports (matches LocalizedString keys)
export const GAME_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'it', name: 'Italiano' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'kr', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
] as const;

export type GameLanguage = (typeof GAME_LANGUAGES)[number]['code'];

const resources = {
  en: { translation: en },
  it: { translation: it },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

/**
 * Change the app language
 */
export function changeLanguage(lang: string): void {
  i18n.changeLanguage(lang);
}

/**
 * Get localized string from arcraiders-data based on language
 * Handles both LocalizedString objects and plain strings for backwards compatibility
 */
export function getLocalizedString(localized: LocalizedString | string | undefined, lang: string): string {
  if (!localized) return '';

  // Handle plain string (backwards compatibility)
  if (typeof localized === 'string') {
    return localized;
  }

  // Handle LocalizedString object
  const value = localized[lang as keyof LocalizedString];
  return value || localized.en || '';
}

export default i18n;
