/**
 * Détection des « leeches » : cartes qui échouent trop souvent. Au-delà du seuil
 * (`Settings.leechThreshold`, défaut 6), la carte est signalée et mise en pause —
 * l'écran de leçon de reprise la proposera plutôt que de la rabâcher.
 *
 * Pur : ne fait que décider. La persistance de l'événement `card_suspended` et
 * du drapeau `leech` est faite par l'appelant.
 */

import { type Card, type SrsState } from '../../types/srs'

export function isLeech(card: Pick<Card, 'lapses' | 'leech'>, threshold: number): boolean {
  return card.leech || card.lapses >= threshold
}

export interface LeechDecision {
  /** la carte franchit le seuil à cette révision (transition) */
  becameLeech: boolean
  /** la carte doit être mise en pause maintenant */
  shouldSuspend: boolean
}

export function evaluateLeech(
  before: Pick<SrsState, 'lapses'>,
  after: Pick<SrsState, 'lapses'>,
  card: Pick<Card, 'leech' | 'suspended'>,
  threshold: number,
): LeechDecision {
  const crossed = before.lapses < threshold && after.lapses >= threshold
  const becameLeech = crossed && !card.leech
  return {
    becameLeech,
    shouldSuspend: becameLeech && !card.suspended,
  }
}
