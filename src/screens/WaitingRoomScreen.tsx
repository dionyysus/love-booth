import type { AppSession, SessionData } from '../types'
import { useEffect, useState } from 'react'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function WaitingRoomScreen({ session, setSession }: Props) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  // Poll for session updates
  useEffect(() => {
    if (!session.sessionCode) return

    const checkSession = () => {
      const data = localStorage.getItem(`session_${session.sessionCode}`)
      if (data) {
        const parsed: SessionData = JSON.parse(data)
        setSessionData(parsed)

        // If both joined, move to session screen
        if (parsed.hostJoined && parsed.guestJoined) {
          setTimeout(() => {
            setSession((s) => ({ ...s, screen: 'session' }))
          }, 1000)
        }
      }
    }

    checkSession()
    const interval = setInterval(checkSession, 500)

    return () => clearInterval(interval)
  }, [session.sessionCode, setSession])

  const handleBack = () => {
    // Clean up session if host leaves
    if (session.role === 'host' && session.sessionCode) {
      localStorage.removeItem(`session_${session.sessionCode}`)
    }
    setSession({
      screen: 'landing',
      role: null,
      sessionCode: null,
      localPhotos: [],
    })
  }

  const isHost = session.role === 'host'
  const partnerJoined = sessionData?.hostJoined && sessionData?.guestJoined

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="absolute top-8 left-8 text-sm text-gray-400 hover:text-gray-900 transition-colors"
      >
        ← back
      </button>

      {/* Title */}
      <h1 className="text-3xl font-light tracking-tight text-gray-900 mb-12">
        {isHost ? 'waiting for partner' : 'joined session'}
      </h1>

      {/* Session code display (only for host) */}
      {isHost && session.sessionCode && (
        <div className="mb-16">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-4 text-center">
            share this code
          </p>
          <div className="px-12 py-6 bg-black text-white font-mono text-5xl tracking-widest">
            {session.sessionCode}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="flex items-center gap-4">
        {/* You */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-black mb-2"></div>
          <p className="text-xs text-gray-600">you</p>
        </div>

        {/* Connecting line */}
        <div className="w-24 h-px bg-gray-300 relative">
          {partnerJoined && (
            <div className="absolute inset-0 bg-black animate-pulse"></div>
          )}
        </div>

        {/* Partner */}
        <div className="text-center">
          <div className={`w-16 h-16 rounded-full mb-2 transition-colors ${
            partnerJoined ? 'bg-black' : 'bg-gray-200'
          }`}></div>
          <p className="text-xs text-gray-600">
            {partnerJoined ? 'partner' : 'waiting...'}
          </p>
        </div>
      </div>

      {partnerJoined && (
        <p className="mt-8 text-sm text-gray-600 animate-pulse">
          starting session...
        </p>
      )}
    </div>
  )
}
