import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HskDatabase } from '../../db/db'
import { getCatalog } from '../../data'
import { makeCard } from '../../test/factories'
import { getAllEvents } from '../../db/repositories/events'
import { type Card } from '../../types/srs'
import { SessionScreen } from './SessionScreen'

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

const reviewCard = (id: string, over: Partial<Card> = {}): Card =>
  makeCard({
    itemId: id,
    cardType: 'hanzi_to_sense',
    state: 'review',
    due: NOW - HOUR,
    reps: 3,
    stability: 10,
    difficulty: 5,
    createdAt: NOW - 20 * 24 * HOUR,
    ...over,
  })

async function seed(cards: Card[]): Promise<HskDatabase> {
  const db = new HskDatabase(uniqueName('ss'))
  await db.open()
  openDbs.push(db)
  await db.cards.bulkPut(cards)
  return db
}

describe('SessionScreen', () => {
  it('déroule une carte en reconnaissance jusqu’au résumé, puis revient à l’accueil', async () => {
    const db = await seed([reviewCard('w-0001')])
    const onFinish = vi.fn()
    let t = NOW
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        clock={() => t}
        rng={() => 0}
        onFinish={onFinish}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /Afficher la réponse/ }))
    t += 3000
    await user.click(await screen.findByRole('button', { name: 'Bien' }))

    // file d'une seule carte -> résumé
    const back = await screen.findByRole('button', { name: /Retour à l’accueil/ })
    await user.click(back)

    expect(onFinish).toHaveBeenCalledOnce()
    expect(await getAllEvents(db)).toHaveLength(1)
  })

  it('saisie ratée : « Réessayer » rouvre le champ sans passer à la carte suivante', async () => {
    const db = await seed([reviewCard('w-0001', { cardType: 'hanzi_to_pinyin' })])
    const onFinish = vi.fn()
    const t = NOW
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        clock={() => t}
        rng={() => 0}
        onFinish={onFinish}
      />,
    )

    const input = await screen.findByRole('textbox', { name: /pinyin/i })
    await user.type(input, 'faux')
    await user.click(screen.getByRole('button', { name: 'Vérifier' }))

    // « Réessayer » reste offert même après avoir révélé la réponse
    await user.click(screen.getByRole('button', { name: 'Voir la réponse' }))
    expect(screen.getByText(/Réponse :/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer' }))

    // le champ est de nouveau actif, aucune note écrite, toujours la même carte
    expect(await screen.findByRole('button', { name: 'Vérifier' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /pinyin/i })).not.toBeDisabled()
    expect(await getAllEvents(db)).toHaveLength(0)
  })

  it('carte en reconnaissance : le hanzi n’est affiché qu’une fois après révélation', async () => {
    const db = await seed([reviewCard('w-0001')])
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        clock={() => NOW}
        rng={() => 0}
        onFinish={vi.fn()}
      />,
    )

    const reveal = await screen.findByRole('button', { name: /Afficher la réponse/ })
    const hanzi = document.querySelector('[lang="zh-CN"]')?.textContent ?? ''
    expect(hanzi).not.toBe('')

    await user.click(reveal)

    // avant le correctif, l'énoncé + le bloc de révélation affichaient 不客气 deux fois
    expect(screen.getAllByText(hanzi)).toHaveLength(1)
  })

  it('QCM en hanzi : après la note, chaque proposition montre pinyin, sens et bouton d’écoute', async () => {
    const db = await seed([reviewCard('w-0001', { cardType: 'sense_to_hanzi' })])
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        clock={() => NOW}
        rng={() => 0}
        onFinish={vi.fn()}
      />,
    )

    // énoncé = le sens ; options = des hanzi
    await screen.findByText('bonjour')
    await user.click(screen.getByRole('button', { name: '你好' }))

    // correction : pinyin + sens sous le hanzi, et une écoute par proposition
    expect(screen.getByText('nǐ hǎo · bonjour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Écouter 你好' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Écouter / }).length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Bien' })).toBeInTheDocument()
  })

  it('mode « extra » : déroule une carte mûre non encore due', async () => {
    const db = await seed([reviewCard('w-0001', { due: NOW + 3 * 24 * HOUR })])
    const onFinish = vi.fn()
    let t = NOW
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        mode="extra"
        clock={() => t}
        rng={() => 0}
        onFinish={onFinish}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /Afficher la réponse/ }))
    t += 3000
    await user.click(await screen.findByRole('button', { name: 'Bien' }))

    await user.click(await screen.findByRole('button', { name: /Retour à l’accueil/ }))
    expect(onFinish).toHaveBeenCalledOnce()
    expect(await getAllEvents(db)).toHaveLength(1)
  })

  it('permet d’arrêter la session en cours', async () => {
    const db = await seed([reviewCard('w-0001'), reviewCard('w-0002')])
    const onFinish = vi.fn()
    let t = NOW
    const user = userEvent.setup()

    render(
      <SessionScreen
        db={db}
        catalog={getCatalog()}
        timeZone="UTC"
        clock={() => t}
        rng={() => 0}
        onFinish={onFinish}
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Terminer' }))
    expect(await screen.findByRole('heading', { name: /interrompue/i })).toBeInTheDocument()

    t += 1
    await user.click(screen.getByRole('button', { name: /Retour à l’accueil/ }))
    expect(onFinish).toHaveBeenCalledOnce()
  })
})
