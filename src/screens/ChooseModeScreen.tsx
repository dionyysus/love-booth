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
      setSession({
        screen: 'waiting',
        role: 'host',
        sessionCode: code,
        localPhotos: [],
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
    })
  }

  const handleBack = () => {
    setSession((s) => ({ ...s, screen: 'landing' }))
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="absolute top-6 left-6 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        &larr; back
      </button>

      {/* Title */}
      <h2
        className="text-2xl sm:text-3xl font-normal tracking-wide mb-12"
        style={{ fontFamily: "'Playfair Display', serif", color: '#8b7355' }}
      >
        choose your mode
      </h2>

      {/* Mode options */}
      <div className="flex flex-col gap-6 w-full max-w-sm">
        {/* Solo */}
        <button
          onClick={handleSoloMode}
          className="w-full px-8 py-6 border-2 border-gray-200 rounded-2xl hover:border-gray-400 transition-colors text-left"
        >
          <p className="text-lg font-medium text-gray-900 mb-1">solo</p>
          <p className="text-sm text-gray-500">take photos by yourself</p>
        </button>

        {/* Shared */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleCreateSession}
            className="w-full px-8 py-6 border-2 border-gray-200 rounded-2xl hover:border-gray-400 transition-colors text-left"
          >
            <p className="text-lg font-medium text-gray-900 mb-1">shared</p>
            <p className="text-sm text-gray-500">create a session with your partner</p>
          </button>

          {/* Join option */}
          {!showJoin ? (
            <button
              onClick={() => setShowJoin(true)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:border-gray-500 transition-colors"
                autoFocus
              />
              <button
                onClick={handleJoinSession}
                disabled={joinCode.length !== 6}
                className="px-6 py-3 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                join
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p
        className="mt-16 text-xs tracking-wide"
        style={{ color: '#c4a484' }}
      >
        made with love
      </p>
    </div>
  )
}
