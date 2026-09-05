/**
 * Séquence de démarrage de la couche données :
 *  1. snapshot `pre-migration` si une migration de schéma est en attente ;
 *  2. ouverture de la base (les migrations Dexie s'exécutent ici) ;
 *  3. garantie des singletons (settings, userProgress) ;
 *  4. contrôle d'intégrité ;
 *  5. verdict : `ok` (+ snapshot automatique du jour) ou `needs-recovery`
 *     (l'UI affiche l'écran de récupération, sans planter).
 */

import { DEFAULT_DB_NAME, HskDatabase, SCHEMA_VERSION } from './db'
import { snapshotBeforeMigration } from './pre-migration'
import { maybeCreateDailySnapshot, listSnapshots } from './snapshots'
import { getAllCards } from './repositories/cards'
import { getAllEvents } from './repositories/events'
import {
  ensureProgress,
  ensureSettings,
  getMeta,
  getProgress,
  getSettings,
  setMeta,
} from './repositories/singletons'
import { checkIntegrity } from '../core/integrity/check'
import { FSRS_PARAMS_VERSION } from '../core/srs/scheduler'
import { type ContentCatalog } from '../types/content'
import { type SnapshotMeta } from '../types/backup'
import { type IntegrityReport } from '../types/integrity'

export interface BootstrapDeps {
  now: number
  catalog: ContentCatalog
  dbName?: string
  contentVersion?: string
  timeZone?: string
}

export type BootstrapResult =
  | {
      status: 'ok'
      db: HskDatabase
      report: IntegrityReport
      preMigrationSnapshot: SnapshotMeta | null
      dailySnapshot: SnapshotMeta | null
    }
  | {
      status: 'needs-recovery'
      db: HskDatabase
      report: IntegrityReport
      preMigrationSnapshot: SnapshotMeta | null
      snapshots: SnapshotMeta[]
    }

export async function bootstrap(deps: BootstrapDeps): Promise<BootstrapResult> {
  const name = deps.dbName ?? DEFAULT_DB_NAME
  const snapshotOpts = {
    now: deps.now,
    ...(deps.contentVersion !== undefined ? { contentVersion: deps.contentVersion } : {}),
    ...(deps.timeZone !== undefined ? { timeZone: deps.timeZone } : {}),
  }

  const preMigrationSnapshot = await snapshotBeforeMigration(name, {
    targetVersion: SCHEMA_VERSION,
    now: deps.now,
    ...(deps.contentVersion !== undefined ? { contentVersion: deps.contentVersion } : {}),
  })

  const db = new HskDatabase(name)
  await db.open()

  await ensureSettings(db)
  await ensureProgress(db)

  // Trace la version des paramètres FSRS utilisée (utile au rejeu après upgrade).
  if ((await getMeta(db, 'fsrsParamsVersion')) === null) {
    await setMeta(db, 'fsrsParamsVersion', FSRS_PARAMS_VERSION)
  }

  const [cards, events, settings, userProgress] = await Promise.all([
    getAllCards(db),
    getAllEvents(db),
    getSettings(db),
    getProgress(db),
  ])

  const report = checkIntegrity({
    cards,
    events,
    catalog: deps.catalog,
    settings,
    userProgress,
    now: deps.now,
  })

  if (report.hasErrors) {
    return {
      status: 'needs-recovery',
      db,
      report,
      preMigrationSnapshot,
      snapshots: await listSnapshots(db),
    }
  }

  const dailySnapshot = await maybeCreateDailySnapshot(db, snapshotOpts)
  return { status: 'ok', db, report, preMigrationSnapshot, dailySnapshot }
}
