import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it("affiche le titre de l'application", () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'HSK Trainer' })).toBeInTheDocument()
  })

  it('affiche un exemple de chinois avec son pinyin', () => {
    render(<App />)
    expect(screen.getByText(/nǐ hǎo/)).toBeInTheDocument()
    expect(screen.getByText(/你好/)).toHaveAttribute('lang', 'zh-CN')
  })
})
