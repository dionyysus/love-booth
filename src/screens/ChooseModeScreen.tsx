import type { AppSession } from '../types'
import { useState } from 'react'
import { ref, set, get } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function ChooseModeScreen({ setSession }: Props) {
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const handleCreateSession = async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    const sessionData = {
      code,
      hostJoined: true,
      guestJoined: false,
      hostReady: false,
      guestReady: false,
      countdown: null,
      currentShot: 0,
      status: 'waiting' as const,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    }

    try {
      await set(ref(database, `sessions/${code}`), sessionData)
      setSession({
        screen: 'waiting',
        role: 'host',
        sessionCode: code,
        localPhotos: [],
        partnerPhotos: [],
      })
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session. Please try again.')
    }
  }

  const handleJoinSession = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) return

    try {
      const sessionRef = ref(database, `sessions/${code}`)
      const snapshot = await get(sessionRef)

      if (snapshot.exists()) {
        const session = snapshot.val()
        session.guestJoined = true
        session.lastUpdate = Date.now()
        await set(sessionRef, session)

        setSession({
          screen: 'waiting',
          role: 'guest',
          sessionCode: code,
          localPhotos: [],
          partnerPhotos: [],
        })
      } else {
        alert('session not found')
      }
    } catch (error) {
      console.error('Error joining session:', error)
      alert('Error joining session. Please try again.')
    }
  }

  const handleSoloMode = () => {
    setSession({
      screen: 'session',
      role: 'host',
      sessionCode: 'solo',
      localPhotos: [],
      partnerPhotos: [],
    })
  }

  const handleBack = () => {
    setSession((s) => ({ ...s, screen: 'landing' }))
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-between min-h-screen px-4 py-12">
      {/* Top section */}
      <div className="flex items-center justify-between w-full pr-14">
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
          step 1
        </p>
      </div>

      {/* Center section */}
      <div className="flex flex-col items-center w-full max-w-sm">
        {/* Title */}
        <h2
          className="text-xl sm:text-2xl font-normal tracking-wide mb-10 italic"
          style={{ fontFamily: "'Playfair Display', serif", color: '#8b7355' }}
        >
          choose your mode
        </h2>

        {/* Mode options */}
        <div className="flex flex-col gap-4 w-full">
          {/* Solo */}
          <button
            onClick={handleSoloMode}
            className="w-full px-6 py-5 text-left hover:opacity-70 transition-opacity"
            style={{ border: '1px solid #c4a484', borderRadius: '2px' }}
          >
            <p className="text-sm tracking-wide mb-1" style={{ color: '#8b7355' }}>solo</p>
            <p className="text-xs" style={{ color: '#a08870' }}>take photos by yourself</p>
          </button>

          {/* Shared */}
          <button
            onClick={handleCreateSession}
            className="w-full px-6 py-5 text-left hover:opacity-70 transition-opacity"
            style={{ border: '1px solid #c4a484', borderRadius: '2px' }}
          >
            <p className="text-sm tracking-wide mb-1" style={{ color: '#8b7355' }}>together</p>
            <p className="text-xs" style={{ color: '#a08870' }}>create a session with your partner</p>
          </button>

          {/* Join option */}
          <div className="mt-4 text-center">
            {!showJoin ? (
              <button
                onClick={() => setShowJoin(true)}
                className="text-xs tracking-wide underline underline-offset-4 hover:opacity-70 transition-opacity"
                style={{ color: '#a08870' }}
              >
                have a code? join here
              </button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="enter code"
                  maxLength={6}
                  className="flex-1 px-4 py-3 text-xs font-mono uppercase tracking-widest focus:outline-none transition-colors text-center"
                  style={{
                    border: '1px solid #c4a484',
                    borderRadius: '2px',
                    color: '#8b7355'
                  }}
                  autoFocus
                />
                <button
                  onClick={handleJoinSession}
                  disabled={joinCode.length !== 6}
                  className="px-6 py-3 text-xs tracking-widest uppercase hover:opacity-70 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    border: '1px solid #8b7355',
                    borderRadius: '2px',
                    color: '#8b7355'
                  }}
                >
                  join
                </button>
              </div>
            )}
          </div>
        </div>
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
