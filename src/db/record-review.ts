/**
 * Écriture atomique d'une révision : la carte mise à jour **et** l'événement de
 * journal sont écrits dans une seule transaction Dexie. Si quoi que ce soit
 * échoue, la transaction est annulée — jamais d'état intermédiaire (garantie n°1
 * de sûreté).
 *
 * Le calcul de `card` / `stateBefore` / `stateAfter` est fait en amont par le
 * scheduler (étape 3) ; cette fonction ne fait que persister.
 */

import { type HskDatabase } from './db'
import { nextSeq } from './repositories/events'
import { type ReviewEvent } from '../types/events'
import { newEventId } from '../types/ids'
import { type Card } from '../types/srs'

export interface RecordReviewInput {
  /** carte après application de la note */
  card: Card
  /** brouillon de l'événement de révision (`id` et `seq` attribués ici) */
  event: Omit<ReviewEvent, 'id' | 'seq'>
}

export interface RecordReviewResult {
  card: Card
  event: ReviewEvent
}

export async function recordReview(
  db: HskDatabase,
  input: RecordReviewInput,
): Promise<RecordReviewResult> {
  if (input.event.cardId !== input.card.id) {
    throw new Error("recordReview : l'événement et la carte ne correspondent pas")
  }
  return db.transaction('rw', db.cards, db.events, async () => {
    const seq = await nextSeq(db)
    const event: ReviewEvent = { ...input.event, id: newEventId(), seq }
    await db.events.add(event)
    await db.cards.put(input.card)
    return { card: input.card, event }
  })
}
