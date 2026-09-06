import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { CONTENT_VERSION } from '../../data'
import { JournalBuilder, makeCard } from '../../test/factories'
import { exportProgress, serializeBundle } from '../../db/export-import'
import { createSnapshot } from '../../db/snapshots'
import { getAllCards } from '../../db/repositories/cards'
import { getAllEvents } from '../../db/repositories/events'
import * as downloadModule from '../download'
import { BackupScreen } from './BackupScreen'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 2, 1, 9, 0, 0)

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

async function seed(db: HskDatabase): Promise<void> {
  const b = new JournalBuilder()
  const c1 = makeCard({ itemId: 'w-0001', cardType: 'hanzi_to_sense' })
  const c2 = makeCard({ itemId: 'w-0002', cardType: 'sense_to_hanzi' })
  b.create(c1, NOW)
    .create(c2, NOW)
    .review(c1.id, 'good', NOW + DAY)
  await db.cards.bulkPut(b.expectedCards)
  await db.events.bulkPut(b.events)
}

const props = (db: HskDatabase, over: Partial<Parameters<typeof BackupScreen>[0]> = {}) => ({
  db,
  now: NOW,
  timeZone: 'UTC',
  onDone: vi.fn(),
  onDataReplaced: vi.fn(),
  ...over,
})

describe('BackupScreen', () => {
  it('exporte une sauvegarde (déclenche un téléchargement)', async () => {
    const db = await freshDb('bk-export')
    await seed(db)
    const download = vi.spyOn(downloadModule, 'downloadText').mockImplementation(() => undefined)

    render(<BackupScreen {...props(db)} />)

    await userEvent.click(await screen.findByRole('button', { name: /Télécharger une sauvegarde/ }))

    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(download.mock.calls[0]?.[0]).toMatch(/^hsk-trainer-2026-03-01\.json$/)
  })

  it('crée une sauvegarde interne à la demande', async () => {
    const db = await freshDb('bk-snap')

    render(<BackupScreen {...props(db)} />)

    expect(await screen.findByText(/Aucune sauvegarde interne/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Créer maintenant/ }))

    expect(await screen.findByText(/Manuelle/)).toBeInTheDocument()
    expect(await db.snapshots.count()).toBe(1)
  })

  it('importe un fichier valide après confirmation', async () => {
    const source = await freshDb('bk-src')
    await seed(source)
    const json = serializeBundle(
      await exportProgress(source, { now: NOW, contentVersion: CONTENT_VERSION }),
    )

    const target = await freshDb('bk-dst')
    const onDataReplaced = vi.fn()
    render(<BackupScreen {...props(target, { onDataReplaced })} />)

    const file = new File([json], 'sauvegarde.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText(/Importer une sauvegarde/), file)

    // aperçu : 2 cartes, 3 événements (2 créations + 1 révision)
    expect(await screen.findByText(/2 cartes · 3 événements/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Importer et remplacer/ }))

    await waitFor(() => expect(onDataReplaced).toHaveBeenCalledOnce())
    expect(await getAllCards(target)).toHaveLength(2)
    expect(await getAllEvents(target)).toHaveLength(3)
    // un snapshot « avant import » a été pris
    expect((await target.snapshots.toArray()).map((s) => s.reason)).toContain('pre-import')
  })

  it('refuse un fichier illisible', async () => {
    const db = await freshDb('bk-bad')
    render(<BackupScreen {...props(db)} />)

    const file = new File(['ceci n’est pas du JSON'], 'x.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText(/Importer une sauvegarde/), file)

    expect(await screen.findByText(/Fichier refusé/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Importer et remplacer/ })).not.toBeInTheDocument()
  })

  it('restaure une sauvegarde interne', async () => {
    const db = await freshDb('bk-restore')
    await seed(db)
    await createSnapshot(db, 'manual', { now: NOW, contentVersion: CONTENT_VERSION })
    await db.cards.clear() // on casse l'état courant

    const onDataReplaced = vi.fn()
    render(<BackupScreen {...props(db, { onDataReplaced })} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Restaurer' }))

    await waitFor(() => expect(onDataReplaced).toHaveBeenCalledOnce())
    expect(await getAllCards(db)).toHaveLength(2)
  })
})
