// locales/index.ts - 모든 번역 파일 통합
import { ko } from './ko';
import { en } from './en';
import { ja } from './ja';
import { Language } from '../types';

export const TRANSLATIONS: Record<Language, typeof ko> = {
  ko,
  en,
  ja
};

export type TranslationKeys = keyof typeof ko;