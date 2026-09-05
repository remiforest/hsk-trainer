import { makeCard } from '../../test/factories'
import { evaluateLeech, isLeech } from './leech'

describe('isLeech', () => {
  it('vrai au-delà du seuil de lapses', () => {
    expect(isLeech({ lapses: 6, leech: false }, 6)).toBe(true)
    expect(isLeech({ lapses: 5, leech: false }, 6)).toBe(false)
  })
  it('vrai si déjà marquée', () => {
    expect(isLeech({ lapses: 0, leech: true }, 6)).toBe(true)
  })
})

describe('evaluateLeech', () => {
  it('détecte le franchissement du seuil et demande la mise en pause', () => {
    const d = evaluateLeech({ lapses: 5 }, { lapses: 6 }, makeCard(), 6)
    expect(d).toEqual({ becameLeech: true, shouldSuspend: true })
  })

  it('ne redéclenche pas si déjà leech', () => {
    const d = evaluateLeech({ lapses: 6 }, { lapses: 7 }, makeCard({ leech: true }), 6)
    expect(d.becameLeech).toBe(false)
    expect(d.shouldSuspend).toBe(false)
  })

  it('ne demande pas de pause si la carte est déjà suspendue', () => {
    const d = evaluateLeech({ lapses: 5 }, { lapses: 6 }, makeCard({ suspended: true }), 6)
    expect(d.becameLeech).toBe(true)
    expect(d.shouldSuspend).toBe(false)
  })

  it('rien à signaler en dessous du seuil', () => {
    const d = evaluateLeech({ lapses: 2 }, { lapses: 3 }, makeCard(), 6)
    expect(d).toEqual({ becameLeech: false, shouldSuspend: false })
  })
})
