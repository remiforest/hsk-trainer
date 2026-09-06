/**
 * Hook de démarrage : exécute `bootstrap()` une fois (avec le contenu pédagogique
 * réel), puis expose une machine à états simple pour l'`App`.
 *
 *  - `loading`  : vérification en cours ;
 *  - `ready`    : base ouverte, intégrité OK ;
 *  - `recovery` : le contrôle d'intégrité a trouvé des erreurs — l'UI montre
 *                 l'écran de récupération, sans jamais planter ni écrire ;
 *  - `error`    : échec inattendu à l'ouverture (quota, IndexedDB indisponible…).
 *
 * `reload()` relance toute la séquence (après une réparation ou une restauration).
 */

import { useCallback, useEffect, useState } from 'react'
import { bootstrap } from '../db/bootstrap'
import { type HskDatabase } from '../db/db'
import { CONTENT_VERSION, getCatalog } from '../data'
import { type SnapshotMeta } from '../types/backup'
import { type IntegrityReport } from '../types/integrity'

export interface BootConfig {
  /** nom de base IndexedDB — les tests en passent un unique pour s'isoler */
  dbName?: string
  /** horloge injectée — fixée au montage par l'`App` */
  now?: number
  timeZone?: string
}

export type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; db: HskDatabase; report: IntegrityReport }
  | { phase: 'recovery'; db: HskDatabase; report: IntegrityReport; snapshots: SnapshotMeta[] }
  | { phase: 'error'; error: Error }

export interface UseBootstrap {
  state: BootState
  reload: () => void
}

export function useBootstrap(config: BootConfig = {}): UseBootstrap {
  const { dbName, now, timeZone } = config
  const [state, setState] = useState<BootState>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => {
    setState({ phase: 'loading' })
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    // L'état « loading » est posé par `useState` au montage et par `reload()`
    // ensuite ; l'effet se contente de lancer la séquence.
    let cancelled = false

    void (async () => {
      try {
        const res = await bootstrap({
          now: now ?? Date.now(),
          catalog: getCatalog(),
          contentVersion: CONTENT_VERSION,
          ...(dbName !== undefined ? { dbName } : {}),
          ...(timeZone !== undefined ? { timeZone } : {}),
        })
        if (cancelled) {
          res.db.close()
          return
        }
        if (res.status === 'ok') {
          setState({ phase: 'ready', db: res.db, report: res.report })
        } else {
          setState({
            phase: 'recovery',
            db: res.db,
            report: res.report,
            snapshots: res.snapshots,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setState({ phase: 'error', error: err instanceof Error ? err : new Error(String(err)) })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dbName, now, timeZone, nonce])

  return { state, reload }
}
