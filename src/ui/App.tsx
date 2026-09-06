import { useEffect, useState, type JSX } from 'react'
import { getCatalog } from '../data'
import { ensureSettings } from '../db/repositories/singletons'
import { useBootstrap, type BootConfig } from './useBootstrap'
import { applyTheme } from './theme'
import { ErrorScreen } from './screens/ErrorScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LessonScreen } from './screens/LessonScreen'
import { LoadingScreen } from './screens/LoadingScreen'
import { RecoveryScreen } from './screens/RecoveryScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'

export interface AppProps {
  /** injection pour les tests (nom de base isolé, horloge fixe) */
  bootConfig?: BootConfig
}

type Screen = 'home' | 'session' | 'lesson' | 'settings'

export function App({ bootConfig }: AppProps = {}): JSX.Element {
  // Horloge figée au montage : une session dure quelques minutes, inutile de la
  // faire dériver, et le démarrage et l'accueil partagent le même « maintenant ».
  const [now] = useState(() => bootConfig?.now ?? Date.now())
  const timeZone = bootConfig?.timeZone

  const { state, reload } = useBootstrap({
    ...bootConfig,
    now,
  })
  const [screen, setScreen] = useState<Screen>('home')

  // Applique le thème enregistré dès que la base est prête.
  const db = state.phase === 'ready' ? state.db : null
  useEffect(() => {
    if (db === null) {
      return
    }
    let cancelled = false
    void ensureSettings(db).then((s) => {
      if (!cancelled) {
        applyTheme(s.theme)
      }
    })
    return () => {
      cancelled = true
    }
  }, [db])

  if (state.phase === 'loading') {
    return <LoadingScreen />
  }
  if (state.phase === 'error') {
    return <ErrorScreen error={state.error} onRetry={reload} />
  }
  if (state.phase === 'recovery') {
    return (
      <RecoveryScreen
        db={state.db}
        report={state.report}
        snapshots={state.snapshots}
        now={now}
        {...(timeZone !== undefined ? { timeZone } : {})}
        onRecovered={reload}
      />
    )
  }

  if (screen === 'session') {
    return (
      <SessionScreen
        db={state.db}
        catalog={getCatalog()}
        {...(timeZone !== undefined ? { timeZone } : {})}
        onFinish={() => setScreen('home')}
      />
    )
  }
  if (screen === 'lesson') {
    return (
      <LessonScreen
        db={state.db}
        catalog={getCatalog()}
        now={now}
        onDone={() => setScreen('home')}
      />
    )
  }
  if (screen === 'settings') {
    return <SettingsScreen db={state.db} onDone={() => setScreen('home')} />
  }
  return (
    <HomeScreen
      db={state.db}
      catalog={getCatalog()}
      now={now}
      {...(timeZone !== undefined ? { timeZone } : {})}
      onStartSession={() => setScreen('session')}
      onStartLesson={() => setScreen('lesson')}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
