import { type JSX } from 'react'

export interface SessionScreenProps {
  onExit: () => void
}

/**
 * Réservé pour l'étape 7 : boucle de révision (machine `core/srs/session`,
 * rendu des exercices via `core/cards/quiz`, persistance via
 * `db/review-session#persistAnswer`).
 */
export function SessionScreen({ onExit }: SessionScreenProps): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm opacity-70">La boucle de révision arrive à l’étape 7.</p>
      <button
        type="button"
        onClick={onExit}
        className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium"
      >
        Retour à l’accueil
      </button>
    </main>
  )
}
