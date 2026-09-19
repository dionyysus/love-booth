import { useState } from 'react'
import type { AppSession } from './types'
import { initialAppSession } from './types'
import { LandingScreen } from './screens/LandingScreen'
import { ChooseModeScreen } from './screens/ChooseModeScreen'
import { WaitingRoomScreen } from './screens/WaitingRoomScreen'
import { SessionScreen } from './screens/SessionScreen'
import { ResultScreen } from './screens/ResultScreen'
import { useAmbientMusic } from './hooks/useAmbientMusic'

function App() {
  const [session, setSession] = useState<AppSession>(initialAppSession)
  const { isPlaying, toggle } = useAmbientMusic()

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

  return (
    <>
      {renderScreen()}

      {/* Music toggle button */}
      <button
        onClick={toggle}
        className="fixed top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 z-50"
        style={{
          backgroundColor: isPlaying ? 'rgba(139, 115, 85, 0.9)' : 'rgba(200, 180, 160, 0.6)',
          border: '1px solid rgba(139, 115, 85, 0.3)',
        }}
        title={isPlaying ? 'Pause music' : 'Play music'}
      >
        {isPlaying ? (
          // Sound on icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          // Sound off icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>
    </>
  )
}

export default App
