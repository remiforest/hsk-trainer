/**
 * Journal d'événements append-only. Chaque entrée est **immuable** : les
 * dépôts n'exposent que l'ajout et la lecture, jamais la modification ni la
 * suppression.
 *
 * L'état des cartes (`cards`) est une projection pure de ce journal
 * (`core/journal/rebuild.ts`). C'est le filet de sécurité ultime : si `cards`
 * est corrompu, on le recalcule depuis `events`.
 *
 * Ordre total : le champ `seq`, entier monotone attribué à l'insertion. `at` est
 * l'horloge murale (epoch ms) et peut comporter des ex æquo ; `seq` non.
 */

import { type CardId, type EventId, type SessionId } from './ids'
import { type Card, type Rating, type SrsState } from './srs'

interface BaseEvent {
  id: EventId
  seq: number
  /** epoch ms */
  at: number
}

/** Création d'une carte (validation d'une leçon, à partir de l'étape 6). */
export interface CardCreatedEvent extends BaseEvent {
  kind: 'card_created'
  cardId: CardId
  /** état initial complet de la carte */
  card: Card
}

/** Une révision. Cœur du journal. */
export interface ReviewEvent extends BaseEvent {
  kind: 'card_reviewed'
  cardId: CardId
  sessionId: SessionId
  rating: Rating
  stateBefore: SrsState
  stateAfter: SrsState
  intervalBeforeDays: number
  intervalAfterDays: number
  /** temps de réponse de l'utilisateur, en ms */
  elapsedMs: number
}

export type SuspendReason = 'leech' | 'manual'

export interface CardSuspendedEvent extends BaseEvent {
  kind: 'card_suspended'
  cardId: CardId
  reason: SuspendReason
}

export interface CardUnsuspendedEvent extends BaseEvent {
  kind: 'card_unsuspended'
  cardId: CardId
}

/** Validation d'une leçon (à partir de l'étape 6). */
export interface LessonCompletedEvent extends BaseEvent {
  kind: 'lesson_completed'
  lessonId: string
}

export type JournalEvent =
  CardCreatedEvent | ReviewEvent | CardSuspendedEvent | CardUnsuspendedEvent | LessonCompletedEvent

export type JournalEventKind = JournalEvent['kind']

/** Données d'un événement avant attribution de `id` / `seq` / `at`. */
export type NewJournalEvent =
  | Omit<CardCreatedEvent, 'id' | 'seq' | 'at'>
  | Omit<ReviewEvent, 'id' | 'seq' | 'at'>
  | Omit<CardSuspendedEvent, 'id' | 'seq' | 'at'>
  | Omit<CardUnsuspendedEvent, 'id' | 'seq' | 'at'>
  | Omit<LessonCompletedEvent, 'id' | 'seq' | 'at'>

export function isReviewEvent(e: JournalEvent): e is ReviewEvent {
  return e.kind === 'card_reviewed'
}
