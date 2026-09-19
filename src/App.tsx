import { useState } from 'react'
import type { AppSession } from './types'
import { initialAppSession } from './types'
import { LandingScreen } from './screens/LandingScreen'
import { ChooseModeScreen } from './screens/ChooseModeScreen'
import { WaitingRoomScreen } from './screens/WaitingRoomScreen'
import { SessionScreen } from './screens/SessionScreen'
import { ResultScreen } from './screens/ResultScreen'

function App() {
  const [session, setSession] = useState<AppSession>(initialAppSession)

  const renderScreen = () => {
    switch (session.screen) {
      case 'landing':
        return <LandingScreen setSession={setSession} />
      case 'choose':
        return <ChooseModeScreen setSession={setSession} />
      case 'waiting':
        return <WaitingRoomScreen session={session} setSession={setSession} />
      case 'session':
        return <SessionScreen session={session} setSession={setSession} />
      case 'result':
        return <ResultScreen session={session} setSession={setSession} />
      default:
        return <LandingScreen setSession={setSession} />
    }
  }

  return <>{renderScreen()}</>
}

export default App
