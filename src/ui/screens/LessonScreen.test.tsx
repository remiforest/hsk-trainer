import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { getCatalog } from '../../data'
import { getAllCards } from '../../db/repositories/cards'
import { getProgress } from '../../db/repositories/singletons'
import { LessonScreen } from './LessonScreen'

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

const uniqueName = (p: string): string =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const openDbs: HskDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

async function freshDb(): Promise<HskDatabase> {
  const db = new HskDatabase(uniqueName('lesson'))
  await db.open()
  openDbs.push(db)
  return db
}

describe('LessonScreen', () => {
  it('présente la première leçon puis crée ses cartes', async () => {
    const db = await freshDb()
    const onDone = vi.fn()

    render(<LessonScreen db={db} catalog={getCatalog()} now={NOW} onDone={onDone} />)

    // l-001 « Bonjour ! », 8 mots, pas de grammaire
    expect(await screen.findByRole('heading', { name: 'Bonjour !' })).toBeInTheDocument()
    expect(screen.getByText(/Vocabulaire \(8\)/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /J’ai étudié/ }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(await getAllCards(db)).toHaveLength(32) // 8 mots × 4 types
    expect((await getProgress(db))?.completedLessonIds).toEqual(['l-001'])
  })

  it('quand toutes les leçons sont faites, propose seulement le retour', async () => {
    const db = await freshDb()
    const allIds = [...getCatalog().lessons.values()].map((l) => l.id)
    await db.userProgress.put({
      id: 'progress',
      completedLessonIds: allIds,
      streakDays: 0,
      lastActiveDayKey: null,
      totalReviews: 0,
      totalTimeMs: 0,
    })
    const onDone = vi.fn()

    render(<LessonScreen db={db} catalog={getCatalog()} now={NOW} onDone={onDone} />)

    expect(await screen.findByText(/Toutes les leçons sont terminées/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Retour à l’accueil/ }))
    expect(onDone).toHaveBeenCalledOnce()
  })
})
