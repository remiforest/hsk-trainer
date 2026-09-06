import { useState, type JSX } from 'react'
import { useBootstrap, type BootConfig } from './useBootstrap'
import { ErrorScreen } from './screens/ErrorScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LoadingScreen } from './screens/LoadingScreen'
import { RecoveryScreen } from './screens/RecoveryScreen'
import { SessionScreen } from './screens/SessionScreen'

export interface AppProps {
  /** injection pour les tests (nom de base isolé, horloge fixe) */
  bootConfig?: BootConfig
}

type Screen = 'home' | 'session'

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
    return <SessionScreen onExit={() => setScreen('home')} />
  }
  return (
    <HomeScreen
      db={state.db}
      now={now}
      {...(timeZone !== undefined ? { timeZone } : {})}
      onStartSession={() => setScreen('session')}
    />
  )
}
