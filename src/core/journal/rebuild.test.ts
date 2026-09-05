import { JournalBuilder, makeCard } from '../../test/factories'
import { makeCardId } from '../../types/ids'
import { rebuildCardsFromJournal } from './rebuild'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0)

describe('rebuildCardsFromJournal', () => {
  it('reconstruit l’état après une suite de révisions', () => {
    const b = new JournalBuilder()
    const a = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
    const c = makeCard({ itemId: 'w-0002', cardType: 'sense_to_hanzi' })
    b.create(a, T0)
      .create(c, T0)
      .review(a.id, 'good', T0 + DAY)
      .review(a.id, 'again', T0 + 2 * DAY)
      .review(c.id, 'easy', T0 + 2 * DAY)
      .review(a.id, 'good', T0 + 3 * DAY)

    const { cards, orphanReviewCardIds } = rebuildCardsFromJournal(b.events)

    expect(orphanReviewCardIds).toEqual([])
    const expected = new Map(b.expectedCards.map((card) => [card.id, card]))
    expect(cards.get(a.id)).toEqual(expected.get(a.id))
    expect(cards.get(c.id)).toEqual(expected.get(c.id))
  })

  it('est indépendant de l’ordre d’entrée (tri sur seq)', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0003' })
    b.create(card, T0)
      .review(card.id, 'good', T0 + DAY)
      .review(card.id, 'good', T0 + 4 * DAY)

    const forward = rebuildCardsFromJournal(b.events)
    const shuffled = rebuildCardsFromJournal([...b.events].reverse())

    expect(shuffled.cards.get(card.id)).toEqual(forward.cards.get(card.id))
  })

  it('applique suspension puis reprise', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0004' })
    b.create(card, T0)
    const events = b.events
    events.push({
      kind: 'card_suspended',
      id: crypto.randomUUID() as never,
      seq: 10,
      at: T0 + DAY,
      cardId: card.id,
      reason: 'leech',
    })
    events.push({
      kind: 'card_unsuspended',
      id: crypto.randomUUID() as never,
      seq: 11,
      at: T0 + 2 * DAY,
      cardId: card.id,
    })

    const { cards } = rebuildCardsFromJournal(events)
    expect(cards.get(card.id)?.suspended).toBe(false)
    expect(cards.get(card.id)?.leech).toBe(true)
  })

  it('synthétise une carte quand card_created est manquant et le signale', () => {
    const b = new JournalBuilder()
    const card = makeCard({ itemId: 'w-0005' })
    b.create(card, T0).review(card.id, 'good', T0 + DAY)
    // on retire l'événement de création
    const withoutCreate = b.events.filter((e) => e.kind !== 'card_created')

    const { cards, orphanReviewCardIds } = rebuildCardsFromJournal(withoutCreate)

    expect(orphanReviewCardIds).toEqual([makeCardId('word', 'w-0005', 'hanzi_to_sense')])
    expect(cards.get(card.id)?.reps).toBe(1)
    expect(cards.get(card.id)?.itemId).toBe('w-0005')
  })

  it('renvoie une map vide pour un journal vide', () => {
    expect(rebuildCardsFromJournal([]).cards.size).toBe(0)
  })
})
