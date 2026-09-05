/** Rapport du contrôle de cohérence exécuté au démarrage (`core/integrity/check.ts`). */

import { type CardId, type EventId } from './ids'

export type IntegrityProblemKind =
  | 'orphan_card' // carte référençant un item absent du catalogue
  | 'invalid_card_type' // cardType incompatible avec l'itemType
  | 'orphan_event' // événement visant une carte inexistante et sans card_created
  | 'invalid_date' // date NaN / non finie / hors plage plausible
  | 'seq_not_monotonic' // seq non strictement croissant dans le journal
  | 'duplicate_event_id' // deux événements partagent le même id
  | 'reps_mismatch' // card.reps != nombre de card_reviewed pour la carte
  | 'lapses_mismatch' // card.lapses != nombre de "again" en review/relearning
  | 'state_mismatch' // état stocké != état reconstruit depuis le journal
  | 'missing_singleton' // settings ou userProgress manquant

export type IntegritySeverity = 'warn' | 'error'

export interface IntegrityProblem {
  kind: IntegrityProblemKind
  severity: IntegritySeverity
  message: string
  cardId?: CardId
  eventId?: EventId
}

export interface IntegrityReport {
  ok: boolean
  checkedAt: number
  cardsChecked: number
  eventsChecked: number
  problems: IntegrityProblem[]
  /** au moins un problème de sévérité `error` */
  hasErrors: boolean
}
