/** Petits formateurs d'affichage, purs. */

/** Durée lisible : « 12 min » au-delà d'une minute, « 45 s » en dessous, « 0 s » pour rien. */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(totalSec / 60)
  if (min > 0) {
    return `${min} min`
  }
  return `${totalSec} s`
}

/** Série de jours : « 3 jours », « 1 jour », « aucune série » pour 0. */
export function formatStreak(days: number): string {
  if (days <= 0) {
    return 'aucune série'
  }
  return `${days} jour${days > 1 ? 's' : ''}`
}
