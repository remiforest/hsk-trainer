/**
 * Actions de récupération proposées par l'écran de récupération quand le
 * contrôle d'intégrité échoue : recalculer l'état des cartes depuis le journal.
 * (La restauration d'un snapshot est dans `snapshots.ts`.)
 */

import { type HskDatabase } from './db'
import { getAllEvents } from './repositories/events'
import { rebuildCardsFromJournal } from '../core/journal/rebuild'

export interface RebuildOutcome {
  cardsBefore: number
  cardsAfter: number
  orphanReviewCardIds: string[]
}

/** Remplace la table `cards` par l'état reconstruit à partir du seul journal. */
export async function rebuildCardsAndPersist(db: HskDatabase): Promise<RebuildOutcome> {
  const events = await getAllEvents(db)
  const { cards, orphanReviewCardIds } = rebuildCardsFromJournal(events)
  const cardsBefore = await db.cards.count()

  await db.transaction('rw', db.cards, async () => {
    await db.cards.clear()
    await db.cards.bulkPut([...cards.values()])
  })

  return { cardsBefore, cardsAfter: cards.size, orphanReviewCardIds }
}
