/**
 * Utilitaires de calendrier, purs et sans état. Le fuseau horaire est un
 * paramètre explicite (défaut : celui du runtime) pour que les tests puissent
 * simuler un changement de fuseau. Les « jours » sont manipulés comme des clés
 * `YYYY-MM-DD` en heure locale — suffisant pour le bucketing (streak, file du
 * jour, snapshot quotidien) et insensible aux subtilités DST à minuit.
 */

const DAY_MS = 86_400_000

function runtimeTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Clé de jour local `YYYY-MM-DD`. Le locale `en-CA` produit déjà ce format. */
export function localDayKey(epochMs: number, timeZone: string = runtimeTimeZone()): string {
  assertFiniteTs(epochMs)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochMs))
}

interface Ymd {
  year: number
  month: number // 1-12
  day: number // 1-31
}

function parseDayKey(dayKey: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!m) {
    throw new Error(`Clé de jour invalide « ${dayKey} » (attendu YYYY-MM-DD)`)
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Date calendaire inexistante « ${dayKey} »`)
  }
  return { year, month, day }
}

/** Instant de référence stable pour une clé de jour : midi UTC ce jour-là. */
export function dayKeyToRefMs(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return Date.UTC(year, month - 1, day, 12, 0, 0)
}

/** Décale une clé de jour de `n` jours calendaires (peut être négatif). */
export function addDaysToDayKey(dayKey: string, n: number): string {
  const ref = dayKeyToRefMs(dayKey) + n * DAY_MS
  const d = new Date(ref)
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const da = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${mo}-${da}`
}

/** Nombre de jours calendaires de `fromKey` à `toKey` (positif si `toKey` est après). */
export function diffDayKeys(fromKey: string, toKey: string): number {
  return Math.round((dayKeyToRefMs(toKey) - dayKeyToRefMs(fromKey)) / DAY_MS)
}

export function isSameOrBeforeDay(aKey: string, bKey: string): boolean {
  return dayKeyToRefMs(aKey) <= dayKeyToRefMs(bKey)
}

/** Clé de semaine ISO `GGGG-Www` (semaines commençant le lundi, basées sur le jeudi). */
export function isoWeekKey(epochMs: number, timeZone: string = runtimeTimeZone()): string {
  const { year, month, day } = parseDayKey(localDayKey(epochMs, timeZone))
  // Algorithme ISO 8601 classique, calculé en UTC pour éviter tout décalage horaire.
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayNum = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-W${week.toString().padStart(2, '0')}`
}

/**
 * Longueur de la série en cours. La série est « vivante » si le dernier jour
 * actif est aujourd'hui ou hier ; on compte alors les jours consécutifs en
 * remontant. Sinon la série vaut 0.
 */
export function computeStreak(activeDayKeys: Iterable<string>, todayKey: string): number {
  const set = new Set(activeDayKeys)
  if (set.size === 0) {
    return 0
  }
  const yesterdayKey = addDaysToDayKey(todayKey, -1)
  let cursor: string
  if (set.has(todayKey)) {
    cursor = todayKey
  } else if (set.has(yesterdayKey)) {
    cursor = yesterdayKey
  } else {
    return 0
  }
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDaysToDayKey(cursor, -1)
  }
  return streak
}

function assertFiniteTs(epochMs: number): void {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`Timestamp non fini : ${String(epochMs)}`)
  }
}
