import { getInitialSettings } from './settings/settings.js'
import { useSettings } from '../hooks/useSettings.js'

export type UiLanguage = 'ko' | 'en'

const DEFAULT_UI_LANGUAGE: UiLanguage = 'ko'

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === 'en' ? 'en' : DEFAULT_UI_LANGUAGE
}

export function getUiLanguage(): UiLanguage {
  return normalizeUiLanguage(getInitialSettings().uiLanguage)
}

export function useUiLanguage(): UiLanguage {
  const settings = useSettings()
  return normalizeUiLanguage(settings.uiLanguage)
}

export function tUi(ko: string, en: string, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en' ? en : ko
}

export function formatToolUseCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} tool ${count === 1 ? 'use' : 'uses'}`
    : `도구 사용 ${count}회`
}

export function formatTokenCount(
  count: number | string,
  uiLanguage: UiLanguage,
): string {
  return uiLanguage === 'en' ? `${count} tokens` : `토큰 ${count}개`
}

export function formatMemoryCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} ${count === 1 ? 'memory' : 'memories'}`
    : `메모리 ${count}개`
}

export function formatPatternCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} ${count === 1 ? 'pattern' : 'patterns'}`
    : `패턴 ${count}개`
}

export function formatFileCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} ${count === 1 ? 'file' : 'files'}`
    : `파일 ${count}개`
}

export function formatDirectoryCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} ${count === 1 ? 'directory' : 'directories'}`
    : `디렉터리 ${count}개`
}

export function formatTimeCount(count: number, uiLanguage: UiLanguage): string {
  return uiLanguage === 'en'
    ? `${count} ${count === 1 ? 'time' : 'times'}`
    : `${count}회`
}
