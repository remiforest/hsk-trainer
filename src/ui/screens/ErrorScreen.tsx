import { type JSX } from 'react'

export interface ErrorScreenProps {
  error: Error
  onRetry: () => void
}

/**
 * Échec inattendu à l'ouverture de la base (IndexedDB indisponible, quota…). On
 * n'a rien pu lire : aucune action destructive n'est proposée, juste un nouvel
 * essai.
 */
export function ErrorScreen({ error, onRetry }: ErrorScreenProps): JSX.Element {
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
    >
      <h1 className="text-xl font-semibold">Impossible d’ouvrir vos données</h1>
      <p className="text-sm opacity-80">
        Rien n’a été modifié. Vérifiez que votre navigateur autorise le stockage local (pas de
        navigation privée), puis réessayez.
      </p>
      <p className="rounded bg-black/5 p-2 font-mono text-xs opacity-70 dark:bg-white/10">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Réessayer
      </button>
    </main>
  )
}
