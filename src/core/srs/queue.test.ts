import { JournalBuilder, makeCard } from '../../test/factories'
import { buildDayQueue, countNewIntroducedToday } from './queue'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 1, 10, 8, 0, 0) // mardi

const settings = { newCardsPerDay: 8 }

describe('buildDayQueue', () => {
  it('inclut les cartes review dues aujourd’hui ou en retard, pas celles de demain', () => {
    const cards = [
      makeCard({ itemId: 'w-1', state: 'review', due: T0 - 3 * DAY }),
      makeCard({ itemId: 'w-2', state: 'review', due: T0 + 4 * 3_600_000 }), // plus tard aujourd'hui
      makeCard({ itemId: 'w-3', state: 'review', due: T0 + DAY }), // demain
    ]
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.due.map((c) => c.itemId)).toEqual(['w-1', 'w-2'])
  })

  it('n’inclut une carte en apprentissage que si son échéance est atteinte', () => {
    const cards = [
      makeCard({ itemId: 'l-1', state: 'learning', due: T0 - 60_000 }),
      makeCard({ itemId: 'l-2', state: 'learning', due: T0 + 10 * 60_000 }),
    ]
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.due.map((c) => c.itemId)).toEqual(['l-1'])
  })

  it('met l’apprentissage/relearning avant les révisions, puis trie par échéance', () => {
    const cards = [
      makeCard({ itemId: 'r-late', state: 'review', due: T0 - DAY }),
      makeCard({ itemId: 'r-old', state: 'review', due: T0 - 5 * DAY }),
      makeCard({ itemId: 'learn', state: 'relearning', due: T0 - 60_000 }),
    ]
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.due.map((c) => c.itemId)).toEqual(['learn', 'r-old', 'r-late'])
  })

  it('exclut les cartes suspendues', () => {
    const cards = [
      makeCard({ itemId: 'w-1', state: 'review', due: T0 - DAY, suspended: true }),
      makeCard({ itemId: 'w-2', state: 'new', suspended: true }),
    ]
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.due).toHaveLength(0)
    expect(q.fresh).toHaveLength(0)
  })

  it('plafonne les nouvelles cartes selon newCardsPerDay', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      makeCard({ itemId: `n-${String(i).padStart(2, '0')}`, state: 'new', createdAt: T0 + i }),
    )
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.fresh).toHaveLength(8)
    expect(q.fresh.map((c) => c.itemId)).toEqual([
      'n-00',
      'n-01',
      'n-02',
      'n-03',
      'n-04',
      'n-05',
      'n-06',
      'n-07',
    ])
    expect(q.counts.newAvailable).toBe(20)
  })

  it('décompte les nouvelles cartes déjà introduites aujourd’hui', () => {
    const b = new JournalBuilder()
    const c1 = makeCard({ itemId: 'w-1' })
    const c2 = makeCard({ itemId: 'w-2' })
    b.create(c1, T0 - DAY).create(c2, T0 - DAY)
    b.review(c1.id, 'good', T0 - 2 * 3_600_000) // introduite aujourd'hui
    b.review(c2.id, 'good', T0 - 3 * 3_600_000) // introduite aujourd'hui

    const freshCards = Array.from({ length: 10 }, (_, i) =>
      makeCard({ itemId: `n-${i}`, state: 'new', createdAt: T0 + i }),
    )
    const q = buildDayQueue({
      cards: freshCards,
      events: b.events,
      settings,
      now: T0,
      timeZone: 'UTC',
    })
    expect(q.counts.newIntroducedToday).toBe(2)
    expect(q.counts.newSlotsLeft).toBe(6)
    expect(q.fresh).toHaveLength(6)
  })

  it('change de résultat selon le fuseau horaire (le même événement compte ou non pour "aujourd’hui")', () => {
    const b = new JournalBuilder()
    const c1 = makeCard({ itemId: 'w-1' })
    b.create(c1, T0 - 5 * DAY)
    // 2026-02-10 23:30 UTC = 2026-02-11 08:30 à Tokyo
    b.review(c1.id, 'good', Date.UTC(2026, 1, 10, 23, 30, 0))

    const now = Date.UTC(2026, 1, 11, 9, 0, 0) // 2026-02-11 UTC / 2026-02-11 18:00 Tokyo
    expect(countNewIntroducedToday(b.events, now, 'UTC')).toBe(0) // révision datée du 10
    expect(countNewIntroducedToday(b.events, now, 'Asia/Tokyo')).toBe(1) // révision datée du 11
  })

  it('gère un jour sauté : les cartes d’il y a 3 jours sont toujours dues', () => {
    const cards = [makeCard({ itemId: 'w-1', state: 'review', due: T0 - 3 * DAY })]
    const q = buildDayQueue({ cards, events: [], settings, now: T0, timeZone: 'UTC' })
    expect(q.due).toHaveLength(1)
  })
})
