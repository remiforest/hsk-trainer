import { type JSX } from 'react'

export function LoadingScreen(): JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className="size-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40"
        aria-hidden
      />
      <p role="status" className="text-sm opacity-70">
        Vérification de vos données…
      </p>
    </main>
  )
}
