import type { AppSession, SessionData } from '../types'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'
import { ref, onValue, set } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

const COUNTDOWN_SECONDS = 3
const SHOTS_COUNT = 4
const PAUSE_BETWEEN_SHOTS = 1000

export function SessionScreen({ session, setSession }: Props) {
  const { videoRef, status, startCamera, stopCamera, captureFrame } = useCamera()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [currentShot, setCurrentShot] = useState(0)
  const [localPhotos, setLocalPhotos] = useState<string[]>([])
  const isCapturingRef = useRef(false)
  const capturedPhotosRef = useRef<string[]>([])

  const isSoloMode = session.sessionCode === 'solo'

  // Start camera
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])


  // Listen for session updates (skip in solo mode)
  useEffect(() => {
    if (!session.sessionCode || isSoloMode) return

    const sessionRef = ref(database, `sessions/${session.sessionCode}`)
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const parsed: SessionData = snapshot.val()
        setSessionData(parsed)

        // Update countdown and shot during capture
        if (parsed.status === 'capturing') {
          setCountdown(parsed.countdown)
          setCurrentShot(parsed.currentShot)
        }

        // Check if complete
        if (parsed.status === 'complete') {
          setSession((s) => ({
            ...s,
            screen: 'result',
            localPhotos: capturedPhotosRef.current,
          }))
        }

        // If both ready and we're host and not yet capturing, start capture
        if (
          session.role === 'host' &&
          parsed.hostReady &&
          parsed.guestReady &&
          parsed.status === 'waiting' &&
          !isCapturingRef.current
        ) {
          startCaptureSequence(parsed)
        }
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, session.role, setSession, isSoloMode])

  // Handle ready button
  const handleReady = async () => {
    setIsReady(true)

    // Solo mode: start immediately
    if (isSoloMode) {
      startSoloCaptureSequence()
      return
    }

    if (!session.sessionCode || !sessionData) return

    const updated = {
      ...sessionData,
      [session.role === 'host' ? 'hostReady' : 'guestReady']: true,
      lastUpdate: Date.now(),
    }

    // If both ready and we're host, start countdown
    if (session.role === 'host' && updated.hostReady && updated.guestReady) {
      startCaptureSequence(updated)
    } else {
      await set(ref(database, `sessions/${session.sessionCode}`), updated)
    }
  }

  // Start solo capture sequence
  const startSoloCaptureSequence = useCallback(async () => {
    if (isCapturingRef.current) return
    isCapturingRef.current = true
    capturedPhotosRef.current = []

    try {
      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        setCurrentShot(shot)

        // Countdown
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          setCountdown(i)
          await new Promise((r) => setTimeout(r, 1000))
        }

        // Capture!
        setCountdown(0)
        await new Promise((r) => setTimeout(r, 100))

        const photo = captureFrame()
        if (photo) {
          capturedPhotosRef.current.push(photo)
          setLocalPhotos((prev) => [...prev, photo])
        }

        setCountdown(null)

        if (shot < SHOTS_COUNT - 1) {
          await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_SHOTS))
        }
      }

      // Go to result
      await new Promise((r) => setTimeout(r, 500))
      setSession((s) => ({
        ...s,
        screen: 'result',
        localPhotos: capturedPhotosRef.current,
      }))

    } catch (err) {
      console.error('Capture error:', err)
    } finally {
      isCapturingRef.current = false
    }
  }, [captureFrame, setSession])

  // Start capture sequence (only host controls this)
  const startCaptureSequence = useCallback(async (data: SessionData) => {
    if (session.role !== 'host' || !session.sessionCode || isCapturingRef.current) return
    isCapturingRef.current = true

    try {
      const sessionRef = ref(database, `sessions/${session.sessionCode}`)

      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        // Countdown
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          const updated = {
            ...data,
            countdown: i,
            currentShot: shot,
            status: 'capturing' as const,
            lastUpdate: Date.now(),
          }
          await set(sessionRef, updated)
          await new Promise((r) => setTimeout(r, 1000))
        }

        // Capture!
        const updated = {
          ...data,
          countdown: 0,
          currentShot: shot,
          status: 'capturing' as const,
          lastUpdate: Date.now(),
        }
        await set(sessionRef, updated)

        // Wait for both to capture
        await new Promise((r) => setTimeout(r, 500))

        if (shot < SHOTS_COUNT - 1) {
          await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_SHOTS))
        }
      }

      // Mark complete
      const completed = {
        ...data,
        countdown: null,
        currentShot: SHOTS_COUNT,
        status: 'complete' as const,
        lastUpdate: Date.now(),
      }
      await set(sessionRef, completed)

    } catch (err) {
      console.error('Capture error:', err)
    } finally {
      isCapturingRef.current = false
    }
  }, [session.role, session.sessionCode])

  // Capture photo when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && status === 'active') {
      const photo = captureFrame()
      if (photo) {
        setLocalPhotos((prev) => [...prev, photo])
        capturedPhotosRef.current.push(photo)
      }
    }
  }, [countdown, status, captureFrame])

  const bothReady = sessionData?.hostReady && sessionData?.guestReady
  const isCapturing = countdown !== null

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8 bg-black">
      {/* Countdown overlay */}
      {isCapturing && countdown !== null && countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="text-white text-9xl font-light animate-pulse">
            {countdown}
          </div>
        </div>
      )}

      {/* Shot counter */}
      {isCapturing && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-white text-sm font-light tracking-widest z-40">
          {currentShot + 1} / {SHOTS_COUNT}
        </div>
      )}

      {/* Camera preview */}
      <div className="relative w-full max-w-4xl aspect-[16/9] bg-gray-900 rounded-lg overflow-hidden mb-8">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />
        {!isSoloMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-xs font-light tracking-wide bg-black/50 px-3 py-1 rounded">
            your camera
          </div>
        )}
      </div>

      {/* Partner status (only in paired mode) */}
      {!isSoloMode && (
        <div className="mb-8 flex items-center gap-4 text-white text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${sessionData?.hostReady ? 'bg-green-500' : 'bg-white/30'}`}></div>
            <span className="text-white/70">{session.role === 'host' ? 'you' : 'partner'}</span>
          </div>
          <div className="text-white/30">+</div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${sessionData?.guestReady ? 'bg-green-500' : 'bg-white/30'}`}></div>
            <span className="text-white/70">{session.role === 'guest' ? 'you' : 'partner'}</span>
          </div>
        </div>
      )}

      {/* Ready button */}
      {!bothReady && !isCapturing && (
        <button
          onClick={handleReady}
          disabled={isReady || status !== 'active'}
          className="px-12 py-4 bg-white text-black text-sm font-light tracking-widest hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isSoloMode ? 'ready' : (isReady ? 'waiting for partner...' : 'ready')}
        </button>
      )}

      {bothReady && !isCapturing && session.role === 'guest' && (
        <p className="text-white text-sm font-light tracking-wide">
          get ready...
        </p>
      )}

      {/* Progress dots */}
      {isCapturing && (
        <div className="flex gap-2 mt-4">
          {Array.from({ length: SHOTS_COUNT }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < localPhotos.length ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
