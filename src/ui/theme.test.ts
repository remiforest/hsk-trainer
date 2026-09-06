import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, resolveTheme } from './theme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
})

describe('resolveTheme', () => {
  it('renvoie le choix explicite', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('résout « system » vers clair en l’absence de matchMedia (jsdom)', () => {
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('applyTheme', () => {
  it('pose data-theme et color-scheme concrets sur <html>', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('« system » se résout aussi vers une valeur concrète', () => {
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
