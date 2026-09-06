/**
 * Application du thème. On résout toujours `system` vers `light`/`dark` (via
 * `prefers-color-scheme`) et on pose un `data-theme` concret sur `<html>` : les
 * utilitaires `dark:` de Tailwind ciblent `[data-theme='dark']`
 * (voir `@custom-variant` dans `index.css`).
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') {
    return pref
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === 'undefined') {
    return
  }
  const resolved = resolveTheme(pref)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}
