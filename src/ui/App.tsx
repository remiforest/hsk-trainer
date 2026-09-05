import { type JSX } from 'react'
import { loadContent } from '../data'

export function App(): JSX.Element {
  const { words, grammarPoints, lessons } = loadContent()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">HSK Trainer</h1>
      <p className="font-hanzi text-2xl" lang="zh-CN">
        你好 <span className="opacity-60">· nǐ hǎo</span>
      </p>
      <p className="text-sm opacity-70">
        Contenu HSK 1 chargé : {words.length} mots · {grammarPoints.length} points de grammaire ·{' '}
        {lessons.length} leçons.
      </p>
      <p className="text-xs opacity-50">Squelette — la session de révision arrive à l’étape 5.</p>
    </main>
  )
}
