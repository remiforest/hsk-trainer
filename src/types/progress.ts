/** Réglages utilisateur. Une seule ligne dans le store `settings` (id fixe). */
export interface Settings {
  id: 'settings'
  /** objectif quotidien en nombre de révisions */
  dailyReviewTarget: number
  /** plafond de nouvelles cartes introduites par jour */
  newCardsPerDay: number
  /** plafond de révisions « en plus » (cartes mûres révisées en avance) par jour */
  extraReviewsPerDay: number
  /** minutes visées par session (fin de session au choix : file vide OU objectif atteint) */
  dailyMinutesTarget: number
  audioEnabled: boolean
  theme: 'light' | 'dark' | 'system'
  /** nombre d'échecs au-delà duquel une carte est signalée leech */
  leechThreshold: number
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  dailyReviewTarget: 40,
  newCardsPerDay: 8,
  extraReviewsPerDay: 20,
  dailyMinutesTarget: 10,
  audioEnabled: true,
  theme: 'system',
  leechThreshold: 6,
}

/** Progression utilisateur. Une seule ligne dans le store `userProgress` (id fixe). */
export interface UserProgress {
  id: 'progress'
  completedLessonIds: string[]
  /** série de jours consécutifs avec au moins une révision */
  streakDays: number
  /** clé du dernier jour actif, format `YYYY-MM-DD` en heure locale */
  lastActiveDayKey: string | null
  /** total cumulé de révisions */
  totalReviews: number
  /** temps total passé en révision, en ms */
  totalTimeMs: number
}

export const INITIAL_PROGRESS: UserProgress = {
  id: 'progress',
  completedLessonIds: [],
  streakDays: 0,
  lastActiveDayKey: null,
  totalReviews: 0,
  totalTimeMs: 0,
}
