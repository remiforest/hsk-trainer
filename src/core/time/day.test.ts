import {
  addDaysToDayKey,
  computeStreak,
  diffDayKeys,
  isSameOrBeforeDay,
  isoWeekKey,
  localDayKey,
} from './day'

// 2026-03-01T05:30:00Z
const REF = Date.UTC(2026, 2, 1, 5, 30, 0)

describe('localDayKey', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(localDayKey(REF, 'UTC')).toBe('2026-03-01')
  })

  it('dépend du fuseau horaire fourni', () => {
    // 05:30 UTC = 00:30 à New York (même jour), = 14:30 à Tokyo (même jour)
    expect(localDayKey(REF, 'America/New_York')).toBe('2026-03-01')
    // 23:30 UTC la veille -> bascule de jour selon le fuseau
    const lateUtc = Date.UTC(2026, 2, 1, 23, 30, 0)
    expect(localDayKey(lateUtc, 'UTC')).toBe('2026-03-01')
    expect(localDayKey(lateUtc, 'Asia/Tokyo')).toBe('2026-03-02')
    expect(localDayKey(lateUtc, 'America/Los_Angeles')).toBe('2026-03-01')
  })

  it('rejette un timestamp non fini', () => {
    expect(() => localDayKey(Number.NaN, 'UTC')).toThrow()
  })
})

describe('addDaysToDayKey / diffDayKeys', () => {
  it('traverse les limites de mois et d’année', () => {
    expect(addDaysToDayKey('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDaysToDayKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysToDayKey('2024-02-28', 1)).toBe('2024-02-29') // année bissextile
  })

  it('compte les jours entre deux clés', () => {
    expect(diffDayKeys('2026-03-01', '2026-03-08')).toBe(7)
    expect(diffDayKeys('2026-03-08', '2026-03-01')).toBe(-7)
    expect(diffDayKeys('2026-03-01', '2026-03-01')).toBe(0)
  })

  it('rejette une date calendaire inexistante', () => {
    expect(() => addDaysToDayKey('2026-02-30', 1)).toThrow()
    expect(() => diffDayKeys('2026-13-01', '2026-01-01')).toThrow()
  })
})

describe('isSameOrBeforeDay', () => {
  it('ordonne les clés de jour', () => {
    expect(isSameOrBeforeDay('2026-03-01', '2026-03-01')).toBe(true)
    expect(isSameOrBeforeDay('2026-02-28', '2026-03-01')).toBe(true)
    expect(isSameOrBeforeDay('2026-03-02', '2026-03-01')).toBe(false)
  })
})

describe('isoWeekKey', () => {
  it('calcule la semaine ISO', () => {
    // 2026-01-01 est un jeudi -> semaine 01 de 2026
    expect(isoWeekKey(Date.UTC(2026, 0, 1, 12), 'UTC')).toBe('2026-W01')
    // 2026-03-01 est un dimanche -> semaine 09
    expect(isoWeekKey(Date.UTC(2026, 2, 1, 12), 'UTC')).toBe('2026-W09')
  })

  it('rattache les premiers jours de janvier à la dernière semaine de l’année précédente', () => {
    // 2027-01-01 est un vendredi -> semaine 53 de 2026
    expect(isoWeekKey(Date.UTC(2027, 0, 1, 12), 'UTC')).toBe('2026-W53')
  })
})

describe('computeStreak', () => {
  it('compte les jours consécutifs se terminant aujourd’hui', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03']
    expect(computeStreak(days, '2026-03-03')).toBe(3)
  })

  it('reste vivante si le dernier jour actif est hier', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03']
    expect(computeStreak(days, '2026-03-04')).toBe(3)
  })

  it('retombe à zéro après un jour sauté', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03']
    expect(computeStreak(days, '2026-03-05')).toBe(0)
  })

  it('ignore les trous plus anciens', () => {
    const days = ['2026-02-10', '2026-03-02', '2026-03-03', '2026-03-04']
    expect(computeStreak(days, '2026-03-04')).toBe(3)
  })

  it('vaut zéro sans aucun jour actif', () => {
    expect(computeStreak([], '2026-03-04')).toBe(0)
  })
})
