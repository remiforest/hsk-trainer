/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base: './'` -> chemins d'actifs relatifs, l'app se déploie sur n'importe quel
// hébergement statique (racine ou sous-dossier) sans reconfiguration.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    // `fake-indexeddb/auto` en premier : Dexie capture `indexedDB` au chargement
    // du module, il doit donc être présent avant tout import de `dexie`.
    setupFiles: ['fake-indexeddb/auto', './src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
})
