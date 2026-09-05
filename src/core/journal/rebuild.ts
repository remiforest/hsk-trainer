/**
 * Reconstruction de l'état des cartes à partir du seul journal d'événements.
 *
 * Fonction **pure** et **déterministe**, sans dépendance au scheduler : elle
 * rejoue les transitions d'état enregistrées (`stateAfter`) plutôt que de
 * recalculer les intervalles. C'est volontaire — ce filet de sécurité reste
 * valable même si la logique FSRS change entre deux versions. L'étape 3 ajoutera
 * un rejeu « fort » via le scheduler pour recoupement.
 */

import { type JournalEvent } from '../../types/events'
import { type CardId, parseCardId } from '../../types/ids'
import { type Card, type SrsState } from '../../types/srs'

export interface RebuildResult {
  cards: Map<CardId, Card>
  /** cartes révisées sans `card_created` préalable (carte synthétisée depuis l'événement) */
  orphanReviewCardIds: CardId[]
}

function bySeq(a: JournalEvent, b: JournalEvent): number {
  return a.seq - b.seq
}

function applySrsState(card: Card, next: SrsState): Card {
  return {
    ...card,
    state: next.state,
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    lastReviewedAt: next.lastReviewedAt,
    learningStep: next.learningStep,
  }
}

/** Carte minimale synthétisée quand le `card_created` est absent du journal. */
function synthesizeCard(cardId: CardId, at: number, seed: SrsState): Card {
  const { itemType, itemId, cardType } = parseCardId(cardId)
  return {
    id: cardId,
    itemType,
    itemId,
    cardType,
    leech: false,
    suspended: false,
    createdAt: at,
    ...seed,
  }
}

export function rebuildCardsFromJournal(events: readonly JournalEvent[]): RebuildResult {
  const ordered = [...events].sort(bySeq)
  const cards = new Map<CardId, Card>()
  const orphanReviewCardIds = new Set<CardId>()

  for (const event of ordered) {
    switch (event.kind) {
      case 'card_created': {
        cards.set(event.cardId, { ...event.card })
        break
      }
      case 'card_reviewed': {
        const existing = cards.get(event.cardId)
        if (existing) {
          cards.set(event.cardId, applySrsState(existing, event.stateAfter))
        } else {
          orphanReviewCardIds.add(event.cardId)
          cards.set(event.cardId, synthesizeCard(event.cardId, event.at, event.stateAfter))
        }
        break
      }
      case 'card_suspended': {
        const existing = cards.get(event.cardId)
        if (existing) {
          cards.set(event.cardId, {
            ...existing,
            suspended: true,
            leech: event.reason === 'leech' ? true : existing.leech,
          })
        }
        break
      }
      case 'card_unsuspended': {
        const existing = cards.get(event.cardId)
        if (existing) {
          cards.set(event.cardId, { ...existing, suspended: false })
        }
        break
      }
      case 'lesson_completed': {
        // n'affecte pas l'état des cartes
        break
      }
      default: {
        const _exhaustive: never = event
        return _exhaustive
      }
    }
  }

  return { cards, orphanReviewCardIds: [...orphanReviewCardIds] }
}
