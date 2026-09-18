import type { AppSession } from '../types'
import { useState } from 'react'
import { ref, set, get } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function LandingScreen({ setSession }: Props) {
  const [joinCode, setJoinCode] = useState('')

  const handleCreateSession = async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    // Initialize session in Firebase
    const sessionData = {
      code,
      hostJoined: true,
      guestJoined: false,
      hostReady: false,
      guestReady: false,
      countdown: null,
      currentShot: 0,
      hostPhotos: [],
      guestPhotos: [],
      hostPreview: '',
      guestPreview: '',
      status: 'waiting' as const,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    }

    try {
      await set(ref(database, `sessions/${code}`), sessionData)
      console.log('Session created:', code)

      setSession({
        screen: 'waiting',
        role: 'host',
        sessionCode: code,
        localPhotos: [],
      })
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session. Check console for details.')
    }
  }

  const handleJoinSession = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) return

    try {
      // Check if session exists in Firebase
      const sessionRef = ref(database, `sessions/${code}`)
      console.log('Looking for session:', code)
      const snapshot = await get(sessionRef)

      console.log('Snapshot exists:', snapshot.exists())
      console.log('Snapshot data:', snapshot.val())

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
        })
      } else {
        console.error('Session not found:', code)
        alert('session not found')
      }
    } catch (error) {
      console.error('Error joining session:', error)
      alert('Error joining session. Check console.')
    }
  }

  const handleSoloMode = () => {
    // Skip waiting room and go directly to session
    setSession({
      screen: 'session',
      role: 'host', // Solo user acts as host
      sessionCode: 'solo',
      localPhotos: [],
    })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8">
      {/* Title */}
      <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900 mb-16">
        photobooth
      </h1>

      {/* Your booth design */}
      <div className="mb-16">
        <img
          src="/booth-design.png"
          alt="photobooth"
          className="w-full max-w-md h-auto"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-6 items-center">
        {/* Create or join */}
        <div className="flex flex-col sm:flex-row gap-6 items-center">
          {/* Create session */}
          <button
            onClick={handleCreateSession}
            className="px-8 py-3 bg-black text-white text-sm font-light tracking-wide hover:bg-gray-800 transition-colors"
          >
            create session
          </button>

          {/* Divider */}
          <div className="text-gray-400 text-sm">or</div>

          {/* Join session */}
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="enter code"
              maxLength={6}
              className="px-4 py-3 border border-gray-300 text-sm font-mono uppercase focus:outline-none focus:border-black transition-colors"
            />
            <button
              onClick={handleJoinSession}
              disabled={joinCode.length !== 6}
              className="px-6 py-3 bg-black text-white text-sm font-light tracking-wide hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              join
            </button>
          </div>
        </div>

        {/* Solo mode */}
        <button
          onClick={handleSoloMode}
          className="text-sm text-gray-400 hover:text-gray-900 transition-colors underline"
        >
          try solo
        </button>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-gray-400 tracking-wide">
        long distance photo booth
      </p>
    </div>
  )
}
