/**
 * Dépôt du journal append-only. Aucune fonction de mise à jour ni de suppression
 * n'est exposée : seuls l'ajout et la lecture. `seq` est attribué de façon
 * monotone **dans la transaction** d'ajout.
 */

import { type HskDatabase } from '../db'
import { type JournalEvent, type NewJournalEvent } from '../../types/events'
import { newEventId, type CardId } from '../../types/ids'

export async function nextSeq(db: HskDatabase): Promise<number> {
  const last = await db.events.orderBy('seq').last()
  return (last?.seq ?? 0) + 1
}

/**
 * Ajoute un événement au journal. Attribue `id` et `seq`. À utiliser pour les
 * événements autonomes (suspension, validation de leçon). L'écriture couplée
 * carte + événement d'une révision passe par `recordReview`.
 */
export async function appendEvent(db: HskDatabase, draft: NewJournalEvent): Promise<JournalEvent> {
  return db.transaction('rw', db.events, async () => {
    const seq = await nextSeq(db)
    const event: JournalEvent = { ...draft, id: newEventId(), seq }
    await db.events.add(event)
    return event
  })
}

/** Insère des événements en préservant leurs `id` / `seq` (import, restauration). */
export async function bulkPutEventsRaw(
  db: HskDatabase,
  events: readonly JournalEvent[],
): Promise<void> {
  await db.events.bulkPut(events)
}

export async function getAllEvents(db: HskDatabase): Promise<JournalEvent[]> {
  return db.events.orderBy('seq').toArray()
}

export async function getEventsForCard(db: HskDatabase, cardId: CardId): Promise<JournalEvent[]> {
  return db.events.where('cardId').equals(cardId).sortBy('seq')
}

export async function countEvents(db: HskDatabase): Promise<number> {
  return db.events.count()
}

export async function clearEvents(db: HskDatabase): Promise<void> {
  await db.events.clear()
}
