/**
 * Écran de réglages. Charge la ligne `settings`, l'édite localement, applique le
 * thème en direct, puis persiste (`putSettings`). « Annuler » restaure le thème
 * initial sans rien écrire.
 */

import { useEffect, useState, type JSX } from 'react'
import { ensureSettings, putSettings } from '../../db/repositories/singletons'
import { type HskDatabase } from '../../db/db'
import { type Settings } from '../../types/progress'
import { applyTheme, type ThemePreference } from '../theme'

export interface SettingsScreenProps {
  db: HskDatabase
  onDone: () => void
}

interface FormState {
  newCardsPerDay: string
  dailyReviewTarget: string
  dailyMinutesTarget: string
  leechThreshold: string
  audioEnabled: boolean
  theme: ThemePreference
}

const NUMERIC_BOUNDS = {
  newCardsPerDay: [0, 99],
  dailyReviewTarget: [0, 999],
  dailyMinutesTarget: [0, 120],
  leechThreshold: [1, 20],
} as const

function toForm(s: Settings): FormState {
  return {
    newCardsPerDay: String(s.newCardsPerDay),
    dailyReviewTarget: String(s.dailyReviewTarget),
    dailyMinutesTarget: String(s.dailyMinutesTarget),
    leechThreshold: String(s.leechThreshold),
    audioEnabled: s.audioEnabled,
    theme: s.theme,
  }
}

function clampInt(raw: string, [min, max]: readonly [number, number]): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) {
    return min
  }
  return Math.max(min, Math.min(max, n))
}

function toSettings(form: FormState): Omit<Settings, 'id'> {
  return {
    newCardsPerDay: clampInt(form.newCardsPerDay, NUMERIC_BOUNDS.newCardsPerDay),
    dailyReviewTarget: clampInt(form.dailyReviewTarget, NUMERIC_BOUNDS.dailyReviewTarget),
    dailyMinutesTarget: clampInt(form.dailyMinutesTarget, NUMERIC_BOUNDS.dailyMinutesTarget),
    leechThreshold: clampInt(form.leechThreshold, NUMERIC_BOUNDS.leechThreshold),
    audioEnabled: form.audioEnabled,
    theme: form.theme,
  }
}

export function SettingsScreen({ db, onDone }: SettingsScreenProps): JSX.Element {
  const [initial, setInitial] = useState<Settings | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void ensureSettings(db).then((s) => {
      if (!cancelled) {
        setInitial(s)
        setForm(toForm(s))
      }
    })
    return () => {
      cancelled = true
    }
  }, [db])

  if (form === null || initial === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p role="status" className="text-sm opacity-60">
          Chargement…
        </p>
      </main>
    )
  }

  const cancel = (): void => {
    applyTheme(initial.theme)
    onDone()
  }

  const save = (): void => {
    setBusy(true)
    setError(null)
    void putSettings(db, { id: 'settings', ...toSettings(form) })
      .then(() => {
        onDone()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
      })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <header className="pt-4">
        <h1 className="text-2xl font-semibold">Réglages</h1>
      </header>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <NumberField
          id="newCardsPerDay"
          label="Nouvelles cartes par jour"
          value={form.newCardsPerDay}
          onChange={(v) => setForm({ ...form, newCardsPerDay: v })}
        />
        <NumberField
          id="dailyReviewTarget"
          label="Objectif de révisions par jour"
          value={form.dailyReviewTarget}
          onChange={(v) => setForm({ ...form, dailyReviewTarget: v })}
        />
        <NumberField
          id="dailyMinutesTarget"
          label="Objectif de minutes par jour"
          value={form.dailyMinutesTarget}
          onChange={(v) => setForm({ ...form, dailyMinutesTarget: v })}
        />
        <NumberField
          id="leechThreshold"
          label="Seuil de mise en pause (nombre d’échecs)"
          value={form.leechThreshold}
          onChange={(v) => setForm({ ...form, leechThreshold: v })}
        />

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Audio (synthèse vocale)</span>
          <input
            type="checkbox"
            checked={form.audioEnabled}
            onChange={(e) => setForm({ ...form, audioEnabled: e.target.checked })}
            className="size-5"
          />
        </label>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Thème</span>
          <select
            value={form.theme}
            onChange={(e) => {
              const theme = e.target.value as ThemePreference
              setForm({ ...form, theme })
              applyTheme(theme)
            }}
            className="rounded-lg border border-current/20 bg-transparent px-2 py-1 text-sm"
          >
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>

        {error !== null && (
          <p
            role="alert"
            className="rounded bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </main>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-lg border border-current/20 bg-transparent px-2 py-1 text-right"
      />
    </label>
  )
}
