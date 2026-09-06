import { formatDuration, formatStreak } from './format'

describe('formatDuration', () => {
  it('affiche des secondes en dessous d’une minute', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(45_000)).toBe('45 s')
    expect(formatDuration(-5)).toBe('0 s')
  })

  it('affiche des minutes entières au-delà', () => {
    expect(formatDuration(90_000)).toBe('1 min')
    expect(formatDuration(12 * 60_000)).toBe('12 min')
  })
})

describe('formatStreak', () => {
  it('accorde le pluriel et gère l’absence de série', () => {
    expect(formatStreak(0)).toBe('aucune série')
    expect(formatStreak(1)).toBe('1 jour')
    expect(formatStreak(4)).toBe('4 jours')
  })
})
