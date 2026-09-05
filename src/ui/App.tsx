import { type JSX } from 'react'

export function App(): JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">HSK Trainer</h1>
      <p className="font-hanzi text-2xl" lang="zh-CN">
        你好 <span className="opacity-60">· nǐ hǎo</span>
      </p>
      <p className="text-sm opacity-70">Ça marche — squelette prêt (étape 1).</p>
    </main>
  )
}
