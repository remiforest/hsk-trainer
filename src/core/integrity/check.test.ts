import {
  JournalBuilder,
  makeCard,
  makeCatalog,
  makeProgress,
  makeSettings,
} from '../../test/factories'
import { type IntegrityInput, checkIntegrity } from './check'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0)
const NOW = T0 + 30 * DAY

function baseInput(over: Partial<IntegrityInput> = {}): IntegrityInput {
  return {
    cards: [],
    events: [],
    catalog: makeCatalog(),
    settings: makeSettings(),
    userProgress: makeProgress(),
    now: NOW,
    ...over,
  }
}

describe('checkIntegrity', () => {
  it('ne signale rien sur un état sain issu du journal', () => {
    const b = new JournalBuilder()
    const c1 = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
    const c2 = makeCard({ itemId: 'w-0002', cardType: 'audio_to_sense' })
    b.create(c1, T0)
      .create(c2, T0)
      .review(c1.id, 'good', T0 + DAY)
      .review(c1.id, 'again', T0 + 2 * DAY)

    const cards = b.expectedCards
    const report = checkIntegrity(
      baseInput({ cards, events: b.events, catalog: makeCatalog({ cards }) }),
    )

    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.hasErrors).toBe(false)
  })

  it('détecte une carte orpheline (absente du catalogue)', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-9999' })
    b.create(card, T0)
    const report = checkIntegrity(
      baseInput({ cards: b.expectedCards, events: b.events, catalog: makeCatalog() }),
    )
    expect(report.problems.map((p) => p.kind)).toContain('orphan_card')
    expect(report.hasErrors).toBe(true)
  })

  it('détecte une incohérence de compteur reps', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0001' })
    b.create(card, T0).review(card.id, 'good', T0 + DAY)
    const corrupted = b.expectedCards.map((c) => ({ ...c, reps: 5 }))
    const report = checkIntegrity(
      baseInput({ cards: corrupted, events: b.events, catalog: makeCatalog({ cards: corrupted }) }),
    )
    const kinds = report.problems.map((p) => p.kind)
    expect(kinds).toContain('reps_mismatch')
    expect(kinds).toContain('state_mismatch')
  })

  it('détecte un état stocké divergent du journal', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0001' })
    b.create(card, T0).review(card.id, 'good', T0 + DAY)
    const corrupted = b.expectedCards.map((c) => ({ ...c, due: c.due + 999 * DAY }))
    const report = checkIntegrity(
      baseInput({ cards: corrupted, events: b.events, catalog: makeCatalog({ cards: corrupted }) }),
    )
    expect(report.problems.map((p) => p.kind)).toContain('state_mismatch')
  })

  it('détecte une date invalide', () => {
    const card = makeCard({ itemId: 'w-0001', due: Number.NaN })
    const report = checkIntegrity(
      baseInput({ cards: [card], catalog: makeCatalog({ cards: [card] }) }),
    )
    expect(report.problems.map((p) => p.kind)).toContain('invalid_date')
  })

  it('détecte un seq non monotone et un id dupliqué', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0001' })
    b.create(card, T0).review(card.id, 'good', T0 + DAY)
    const events = b.events
    const dup = { ...events[1]!, seq: events[0]!.seq }
    const report = checkIntegrity(
      baseInput({
        cards: b.expectedCards,
        events: [...events, dup],
        catalog: makeCatalog({ cards: b.expectedCards }),
      }),
    )
    const kinds = report.problems.map((p) => p.kind)
    expect(kinds).toContain('seq_not_monotonic')
    expect(kinds).toContain('duplicate_event_id')
  })

  it('détecte un événement orphelin', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0001' })
    b.create(card, T0).review(card.id, 'good', T0 + DAY)
    const events = b.events.filter((e) => e.kind !== 'card_created')
    const report = checkIntegrity(baseInput({ cards: [], events, catalog: makeCatalog() }))
    expect(report.problems.map((p) => p.kind)).toContain('orphan_event')
  })

  it('signale les singletons manquants', () => {
    const report = checkIntegrity(baseInput({ settings: null, userProgress: null }))
    expect(report.problems.filter((p) => p.kind === 'missing_singleton')).toHaveLength(2)
    expect(report.hasErrors).toBe(true)
  })
})
