import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

import en from './locales/en.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import es from './locales/es.json';

export const SUPPORTED_LANGS = ['en', 'pt', 'ru', 'ja', 'zh', 'es'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

// Endonyms — each language named in itself, which is the expected convention
// for a language picker.
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  pt: 'Português (Brasil)',
  ru: 'Русский',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
};

export const LANG_STORAGE_KEY = 'tc_lang_v1';

/**
 * Normalize any incoming code to one of our supported locales, or null if
 * unsupported. Handles:
 *  - navigator.language tags ("pt-BR", "zh-CN") → take the primary subtag
 *  - EFT's non-standard Game.ini codes (jp/ch/po) → map to ja/zh/pt
 */
export function normalizeLang(raw: string | null | undefined): Lang | null {
  if (!raw) return null;
  const c = raw.toLowerCase().split(/[-_]/)[0];
  switch (c) {
    case 'en':
      return 'en';
    case 'pt':
    case 'po': // EFT uses "po" for Portuguese
      return 'pt';
    case 'ru':
      return 'ru';
    case 'ja':
    case 'jp': // EFT uses "jp"
      return 'ja';
    case 'zh':
    case 'ch': // EFT uses "ch"
    case 'cn':
      return 'zh';
    case 'es':
      return 'es';
    default:
      return null;
  }
}

async function detectGameLang(): Promise<Lang | null> {
  try {
    const raw = await invoke<string | null>('get_game_language');
    return normalizeLang(raw);
  } catch {
    return null; // outside Tauri, or the command/file was unavailable
  }
}

/**
 * Resolution order (first hit wins):
 *   1. explicit user choice (localStorage)
 *   2. EFT in-game language (Game.ini via Rust)
 *   3. system / browser language
 *   4. English
 */
export async function resolveInitialLang(): Promise<Lang> {
  const stored = normalizeLang(localStorage.getItem(LANG_STORAGE_KEY));
  if (stored) return stored;

  const game = await detectGameLang();
  if (game) return game;

  const sys = normalizeLang(typeof navigator !== 'undefined' ? navigator.language : null);
  if (sys) return sys;

  return 'en';
}

export async function setupI18n(): Promise<void> {
  const lng = await resolveInitialLang();
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      pt: { translation: pt },
      ru: { translation: ru },
      ja: { translation: ja },
      zh: { translation: zh },
      es: { translation: es },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  });
}

/** Persist + apply a user-chosen language. */
export async function changeLang(lang: Lang): Promise<void> {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
}

export { i18n };
