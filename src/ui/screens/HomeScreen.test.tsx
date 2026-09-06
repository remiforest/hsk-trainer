import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { getCatalog } from '../../data'
import { makeCard } from '../../test/factories'
import { persistAnswer } from '../../db/review-session'
import { makeReviewOutcome } from '../../core/srs/scheduler'
import { newSessionId } from '../../types/ids'
import { type Card } from '../../types/srs'
import { HomeScreen } from './HomeScreen'

const HOUR = 3_600_000
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

async function freshDb(prefix: string): Promise<HskDatabase> {
  const db = new HskDatabase(uniqueName(prefix))
  await db.open()
  openDbs.push(db)
  return db
}

const reviewable = (id: string, over: Partial<Card> = {}): Card =>
  makeCard({
    itemId: id,
    state: 'review',
    due: NOW - HOUR,
    reps: 3,
    stability: 10,
    difficulty: 5,
    ...over,
  })

describe('HomeScreen', () => {
  it('résume la journée et lance la session au clic', async () => {
    const db = await freshDb('home')
    await db.cards.bulkPut([
      makeCard({ itemId: 'w-0001', state: 'new' }),
      makeCard({ itemId: 'w-0002', state: 'new' }),
      reviewable('w-0003'),
    ])
    // une révision déjà faite aujourd'hui (carte distincte, qui sort de la file)
    const answered = reviewable('w-0009', { due: NOW })
    await persistAnswer(db, {
      outcome: makeReviewOutcome({
        card: answered,
        rating: 'good',
        now: NOW,
        sessionId: newSessionId(),
        elapsedMs: 4000,
      }),
      leech: { becameLeech: false, shouldSuspend: false },
      now: NOW,
      elapsedMs: 4000,
      timeZone: 'UTC',
    })

    const onStart = vi.fn()
    const onLesson = vi.fn()
    render(
      <HomeScreen
        db={db}
        catalog={getCatalog()}
        now={NOW}
        timeZone="UTC"
        onStartSession={onStart}
        onStartLesson={onLesson}
        onOpenSettings={vi.fn()}
        onOpenBackups={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'HSK Trainer' })).toBeInTheDocument()
    expect(screen.getByLabelText('Révisions aujourd’hui')).toHaveTextContent('1')
    expect(screen.getByLabelText('À réviser')).toHaveTextContent('1')
    expect(screen.getByLabelText('Nouvelles cartes')).toHaveTextContent('2')

    await userEvent.click(screen.getByRole('button', { name: /Commencer la session \(3\)/ }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('propose la prochaine leçon tant qu’il en reste', async () => {
    const db = await freshDb('home-lesson')
    const onLesson = vi.fn()
    render(
      <HomeScreen
        db={db}
        catalog={getCatalog()}
        now={NOW}
        timeZone="UTC"
        onStartSession={vi.fn()}
        onStartLesson={onLesson}
        onOpenSettings={vi.fn()}
        onOpenBackups={vi.fn()}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: /Étudier la leçon/ }))
    expect(onLesson).toHaveBeenCalledOnce()
  })

  it('n’affiche pas de bouton de session quand il n’y a rien à réviser', async () => {
    const db = await freshDb('home-empty')

    render(
      <HomeScreen
        db={db}
        catalog={getCatalog()}
        now={NOW}
        timeZone="UTC"
        onStartSession={vi.fn()}
        onStartLesson={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenBackups={vi.fn()}
      />,
    )

    expect(await screen.findByText(/Rien à réviser/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Commencer/ })).not.toBeInTheDocument()
  })
})
