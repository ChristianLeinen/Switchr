import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  'zh-CN': '简体中文 (Simplified Chinese)',
  ja: '日本語 (Japanese)',
  de: 'Deutsch (German)',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
} as const;

export type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export function normalizeLanguageCode(lng?: string): SupportedLanguageCode {
  if (!lng) return 'en';
  const normalized = lng.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('en')) return 'en';

  return 'en';
}

const PRELOADED_NAMESPACES = ['App', 'Header', 'FleetView', 'Footer'];

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
    nonExplicitSupportedLngs: false,
    load: 'currentOnly',

    // Preload core shell namespaces; tabs and modals lazy-load on demand
    ns: PRELOADED_NAMESPACES,
    defaultNS: 'App',
    fallbackNS: 'App',

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    detection: {
      // Check localStorage first, then browser settings
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app_locale',
      convertDetectedLanguage: (lng: string) => normalizeLanguageCode(lng),
    },

    interpolation: {
      // React already escapes values to prevent XSS
      escapeValue: false,
    },

    react: {
      // Prevents UI flash while JSON files load
      useSuspense: true,
    },
  });

const syncDocumentLanguage = (lng?: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = normalizeLanguageCode(lng || i18n.resolvedLanguage || i18n.language);
  }
};

i18n.on('initialized', () => syncDocumentLanguage());
i18n.on('languageChanged', (lng) => syncDocumentLanguage(lng));
syncDocumentLanguage();

export default i18n;
