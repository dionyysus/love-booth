import type { AppSession, SessionData } from '../types'
import { useEffect, useState } from 'react'
import { ref, onValue, remove } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function WaitingRoomScreen({ session, setSession }: Props) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  // Listen for session updates
  useEffect(() => {
    if (!session.sessionCode) return

    const sessionRef = ref(database, `sessions/${session.sessionCode}`)
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const parsed: SessionData = snapshot.val()
        setSessionData(parsed)

        // If both joined, move to session screen
        if (parsed.hostJoined && parsed.guestJoined) {
          setTimeout(() => {
            setSession((s) => ({ ...s, screen: 'session' }))
          }, 1000)
        }
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, setSession])

  const handleBack = async () => {
    // Clean up session if host leaves
    if (session.role === 'host' && session.sessionCode) {
      await remove(ref(database, `sessions/${session.sessionCode}`))
    }
    setSession({
      screen: 'landing',
      role: null,
      sessionCode: null,
      localPhotos: [],
      partnerPhotos: [],
    })
  }

  const isHost = session.role === 'host'
  const partnerJoined = sessionData?.hostJoined && sessionData?.guestJoined

  return (
    <div className="flex flex-1 flex-col items-center justify-between min-h-screen px-4 py-12">
      {/* Top section */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={handleBack}
          className="text-xs tracking-widest uppercase hover:opacity-70 transition-opacity"
          style={{ color: '#a08870' }}
        >
          ← back
        </button>
        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: '#c4a484', letterSpacing: '0.2em' }}
        >
          step 2
        </p>
      </div>

      {/* Center section */}
      <div className="flex flex-col items-center">
        {/* Title */}
        <h1
          className="text-xl sm:text-2xl font-normal tracking-wide mb-10 italic"
          style={{ fontFamily: "'Playfair Display', serif", color: '#8b7355' }}
        >
          {isHost ? 'waiting for partner' : 'joined session'}
        </h1>

        {/* Session code display (only for host) */}
        {isHost && session.sessionCode && (
          <div className="mb-12 text-center">
            <p
              className="text-xs tracking-widest uppercase mb-4"
              style={{ color: '#a08870', letterSpacing: '0.2em' }}
            >
              share this code
            </p>
            <div
              className="px-10 py-5 font-mono text-4xl tracking-widest"
              style={{
                color: '#8b7355',
                border: '1px solid #c4a484',
                borderRadius: '2px'
              }}
            >
              {session.sessionCode}
            </div>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-6">
          {/* You */}
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-full mb-2"
              style={{ backgroundColor: '#8b7355' }}
            />
            <p className="text-xs" style={{ color: '#a08870' }}>you</p>
          </div>

          {/* Connecting line */}
          <div className="w-16 relative" style={{ height: '1px', backgroundColor: '#c4a484' }}>
            {partnerJoined && (
              <div
                className="absolute inset-0 animate-pulse"
                style={{ backgroundColor: '#8b7355' }}
              />
            )}
          </div>

          {/* Partner */}
          <div className="text-center">
            <div
              className="w-12 h-12 rounded-full mb-2 transition-colors"
              style={{ backgroundColor: partnerJoined ? '#8b7355' : '#e8e0d5' }}
            />
            <p className="text-xs" style={{ color: '#a08870' }}>
              {partnerJoined ? 'partner' : 'waiting...'}
            </p>
          </div>
        </div>

        {partnerJoined && (
          <p
            className="mt-8 text-xs tracking-wide animate-pulse italic"
            style={{ color: '#8b7355' }}
          >
            starting session...
          </p>
        )}
      </div>

      {/* Footer */}
      <p
        className="text-xs tracking-wide"
        style={{ color: '#d4c4b4' }}
      >
        made with love
      </p>
    </div>
  )
}
