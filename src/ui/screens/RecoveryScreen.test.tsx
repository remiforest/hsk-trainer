import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { JournalBuilder, makeCard } from '../../test/factories'
import { type IntegrityReport } from '../../types/integrity'
import { RecoveryScreen } from './RecoveryScreen'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 15, 9, 0, 0)

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

function reportWith(message: string): IntegrityReport {
  return {
    ok: false,
    checkedAt: T0,
    cardsChecked: 0,
    eventsChecked: 3,
    hasErrors: true,
    problems: [{ kind: 'state_mismatch', severity: 'error', message }],
  }
}

describe('RecoveryScreen', () => {
  it('affiche le diagnostic et recalcule les cartes depuis le journal', async () => {
    const db = new HskDatabase(uniqueName('rec'))
    await db.open()
    openDbs.push(db)
    const b = new JournalBuilder()
    const c1 = makeCard({ itemId: 'w-0001' })
    const c2 = makeCard({ itemId: 'w-0002' })
    b.create(c1, T0)
      .create(c2, T0)
      .review(c1.id, 'good', T0 + DAY)
    await db.events.bulkPut(b.events)
    // table `cards` vide -> état non reconstruit : incohérent

    const onRecovered = vi.fn()
    render(
      <RecoveryScreen
        db={db}
        report={reportWith('Carte word:w-0001:hanzi_to_sense : état incohérent avec le journal.')}
        snapshots={[]}
        now={T0 + 2 * DAY}
        timeZone="UTC"
        onRecovered={onRecovered}
      />,
    )

    expect(screen.getByText(/état incohérent avec le journal/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune sauvegarde interne/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Recalculer/ }))

    await waitFor(() => expect(onRecovered).toHaveBeenCalledOnce())
    expect(await db.cards.count()).toBe(2)
  })
})
