import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../db/db'
import { makeCard } from '../test/factories'
import { type BootConfig } from './useBootstrap'
import { App } from './App'

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0)

const uniqueName = (p: string): string =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const openDbs: HskDatabase[] = []
afterEach(async () => {
  for (const d of openDbs.splice(0)) {
    d.close()
    await d.delete().catch(() => undefined)
  }
})

function config(prefix: string): BootConfig {
  return { dbName: uniqueName(prefix), now: NOW, timeZone: 'UTC' }
}

describe('App', () => {
  it('affiche le chargement puis l’accueil', async () => {
    render(<App bootConfig={config('app-boot')} />)

    expect(screen.getByRole('status')).toHaveTextContent(/Vérification/)
    expect(await screen.findByRole('heading', { name: 'HSK Trainer' })).toBeInTheDocument()
  })

  it('sur une base vierge, indique qu’il n’y a rien à réviser', async () => {
    render(<App bootConfig={config('app-empty')} />)

    expect(await screen.findByText(/Rien à réviser/)).toBeInTheDocument()
  })

  it('navigue vers la session et en revient', async () => {
    const cfg = config('app-nav')
    const db = new HskDatabase(cfg.dbName)
    await db.open()
    await db.cards.bulkPut([
      makeCard({ itemId: 'w-0001', state: 'new', due: NOW, createdAt: NOW }),
      makeCard({ itemId: 'w-0002', state: 'new', due: NOW, createdAt: NOW }),
    ])
    db.close()

    render(<App bootConfig={cfg} />)

    const start = await screen.findByRole('button', { name: /Commencer la session/ })
    await userEvent.click(start)

    // une carte se déroule, puis on arrête la session
    await userEvent.click(await screen.findByRole('button', { name: /Afficher la réponse/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Bien' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Terminer' }))

    await userEvent.click(await screen.findByRole('button', { name: /Retour à l’accueil/ }))
    expect(await screen.findByRole('heading', { name: 'HSK Trainer' })).toBeInTheDocument()
  })

  it('étudier une leçon crée des cartes à réviser', async () => {
    render(<App bootConfig={config('app-lesson')} />)

    // base vierge : rien à réviser, mais une leçon à étudier
    await userEvent.click(await screen.findByRole('button', { name: /Étudier la leçon/ }))
    await userEvent.click(await screen.findByRole('button', { name: /J’ai étudié/ }))

    // de retour à l'accueil, la session devient possible
    expect(await screen.findByRole('button', { name: /Commencer la session/ })).toBeInTheDocument()
  })
})
