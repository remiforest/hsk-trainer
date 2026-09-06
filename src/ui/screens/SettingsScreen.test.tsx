import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { ensureSettings, getSettings } from '../../db/repositories/singletons'
import { SettingsScreen } from './SettingsScreen'

const uniqueName = (p: string): string =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const openDbs: HskDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

async function freshDb(): Promise<HskDatabase> {
  const db = new HskDatabase(uniqueName('settings'))
  await db.open()
  openDbs.push(db)
  return db
}

describe('SettingsScreen', () => {
  it('charge les réglages, les modifie et les enregistre', async () => {
    const db = await freshDb()
    await ensureSettings(db)
    const onDone = vi.fn()

    render(<SettingsScreen db={db} onDone={onDone} />)

    const newCards = await screen.findByLabelText('Nouvelles cartes par jour')
    expect(newCards).toHaveValue(8)
    await userEvent.clear(newCards)
    await userEvent.type(newCards, '12')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect((await getSettings(db))?.newCardsPerDay).toBe(12)
  })

  it('borne les valeurs numériques à l’enregistrement', async () => {
    const db = await freshDb()
    const onDone = vi.fn()

    render(<SettingsScreen db={db} onDone={onDone} />)

    const newCards = await screen.findByLabelText('Nouvelles cartes par jour')
    await userEvent.clear(newCards)
    await userEvent.type(newCards, '9999')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((await getSettings(db))?.newCardsPerDay).toBe(99)
  })

  it('applique le thème choisi immédiatement', async () => {
    const db = await freshDb()

    render(<SettingsScreen db={db} onDone={vi.fn()} />)

    const themeSelect = await screen.findByLabelText('Thème')
    await userEvent.selectOptions(themeSelect, 'dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('« Annuler » restaure le thème initial et n’écrit rien', async () => {
    const db = await freshDb()
    await ensureSettings(db) // thème par défaut : system
    const onDone = vi.fn()

    render(<SettingsScreen db={db} onDone={onDone} />)

    const themeSelect = await screen.findByLabelText('Thème')
    await userEvent.selectOptions(themeSelect, 'dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onDone).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.theme).toBe('light') // system -> résolu clair
    expect((await getSettings(db))?.theme).toBe('system')
  })
})
