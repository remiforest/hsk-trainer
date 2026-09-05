/**
 * État de révision d'une carte. Les dates sont des `number` (epoch ms) pour une
 * sérialisation JSON sans ambiguïté. Le mapping vers/depuis `ts-fsrs` est fait à
 * l'étape 3 dans `core/srs/scheduler.ts`.
 */

import { type CardId, type CardType, type ItemType } from './ids'

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy']

/**
 * Sous-ensemble des champs SRS qui changent à chaque révision. Capturé
 * intégralement dans `stateBefore` / `stateAfter` de chaque `ReviewEvent`, ce qui
 * rend l'état des cartes reconstructible sans rejouer le scheduler.
 */
export interface SrsState {
  state: CardState
  /** epoch ms de la prochaine échéance */
  due: number
  stability: number
  difficulty: number
  reps: number
  lapses: number
  /** epoch ms de la dernière révision, `null` si jamais révisée */
  lastReviewedAt: number | null
  /** index dans les paliers d'apprentissage ; `-1` hors phase d'apprentissage */
  learningStep: number
}

export interface Card extends SrsState {
  id: CardId
  itemType: ItemType
  itemId: string
  cardType: CardType
  /** signalée comme leech (trop d'échecs) */
  leech: boolean
  /** exclue de la file normale (leech ou mise en pause manuelle) */
  suspended: boolean
  /** epoch ms de création de la carte */
  createdAt: number
}

export function initialSrsState(now: number): SrsState {
  return {
    state: 'new',
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
    learningStep: -1,
  }
}

export function pickSrsState(card: SrsState): SrsState {
  return {
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: card.lastReviewedAt,
    learningStep: card.learningStep,
  }
}
