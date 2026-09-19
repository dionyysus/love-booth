import type { AppSession, SessionData } from '../types'
import { useEffect, useState, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useWebRTC } from '../hooks/useWebRTC'
import { ref, onValue, set, update } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

const COUNTDOWN_SECONDS = 3
const SHOTS_COUNT = 4
const PAUSE_BETWEEN_SHOTS = 1000

export function SessionScreen({ session, setSession }: Props) {
  const { videoRef, stream, status, startCamera, stopCamera, captureFrame } = useCamera()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [currentShot, setCurrentShot] = useState(0)
  const [localPhotos, setLocalPhotos] = useState<string[]>([])

  // WebRTC for real-time partner video
  const { remoteStream, state: webrtcState } = useWebRTC(
    session.sessionCode,
    session.role,
    stream
  )
  const partnerVideoRef = useRef<HTMLVideoElement | null>(null)

  // Use Set to track which shots have been captured - bulletproof against duplicates
  const capturedShotsSet = useRef(new Set<number>())
  const capturedPhotosRef = useRef<string[]>([])
  const isCapturingRef = useRef(false)

  const isSoloMode = session.sessionCode === 'solo'

  // Start camera
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Attach remote stream to partner video element
  useEffect(() => {
    if (partnerVideoRef.current && remoteStream) {
      partnerVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Listen for session updates
  useEffect(() => {
    if (!session.sessionCode || isSoloMode) return

    const sessionRef = ref(database, `sessions/${session.sessionCode}`)
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const parsed: SessionData = snapshot.val()
        setSessionData(parsed)

        if (parsed.status === 'capturing') {
          setCountdown(parsed.countdown ?? null)
          setCurrentShot(parsed.currentShot ?? 0)
        }

        if (parsed.status === 'complete') {
          setSession((s) => ({
            ...s,
            screen: 'result',
            localPhotos: capturedPhotosRef.current,
          }))
        }
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, isSoloMode, setSession])

  // START CAPTURE - HOST ONLY triggers when both ready
  useEffect(() => {
    if (isSoloMode) return
    if (session.role !== 'host') return
    if (!sessionData) return
    if (!sessionData.hostReady || !sessionData.guestReady) return
    if (sessionData.status !== 'waiting') return
    if (isCapturingRef.current) return

    isCapturingRef.current = true
    capturedPhotosRef.current = []
    capturedShotsSet.current.clear()

    const runCapture = async () => {
      const sessionRef = ref(database, `sessions/${session.sessionCode}`)

      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        // Countdown 3-2-1
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          // Use update() instead of set() to preserve photos
          await update(sessionRef, {
            countdown: i,
            currentShot: shot,
            status: 'capturing',
            lastUpdate: Date.now(),
          })
          await new Promise(r => setTimeout(r, 1000))
        }

        // Capture moment
        await update(sessionRef, {
          countdown: 0,
          currentShot: shot,
          status: 'capturing',
          lastUpdate: Date.now(),
        })

        // Wait for capture to happen
        await new Promise(r => setTimeout(r, 600))

        if (shot < SHOTS_COUNT - 1) {
          await new Promise(r => setTimeout(r, PAUSE_BETWEEN_SHOTS))
        }
      }

      // Done
      await update(sessionRef, {
        countdown: null,
        currentShot: SHOTS_COUNT,
        status: 'complete',
        lastUpdate: Date.now(),
      })

      isCapturingRef.current = false
    }

    runCapture()
  }, [sessionData, session.role, session.sessionCode, isSoloMode])

  // Capture photo when countdown hits 0 - BULLETPROOF version
  useEffect(() => {
    if (countdown !== 0) return
    if (status !== 'active') return

    // CRITICAL: Check if we already captured this shot
    if (capturedShotsSet.current.has(currentShot)) {
      return
    }

    // Mark as captured IMMEDIATELY before doing anything else
    capturedShotsSet.current.add(currentShot)

    const photo = captureFrame()
    if (!photo) return

    capturedPhotosRef.current.push(photo)
    setLocalPhotos([...capturedPhotosRef.current])

    // Upload higher quality photo to Firebase for partner
    if (session.sessionCode && !isSoloMode) {
      const photoKey = session.role === 'host' ? 'hostPhotos' : 'guestPhotos'
      const video = videoRef.current
      if (video) {
        const canvas = document.createElement('canvas')
        canvas.width = 400
        canvas.height = 500
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.scale(-1, 1)
          ctx.drawImage(video, -400, 0, 400, 500)
          const compressed = canvas.toDataURL('image/jpeg', 0.75)
          set(ref(database, `sessions/${session.sessionCode}/${photoKey}/${currentShot}`), compressed)
        }
      }
    }
  }, [countdown, status, currentShot, captureFrame, session.sessionCode, session.role, isSoloMode, videoRef])

  // Handle ready button
  const handleReady = async () => {
    setIsReady(true)

    if (isSoloMode) {
      isCapturingRef.current = true
      capturedPhotosRef.current = []
      capturedShotsSet.current.clear()

      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        setCurrentShot(shot)
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          setCountdown(i)
          await new Promise(r => setTimeout(r, 1000))
        }
        setCountdown(0)
        await new Promise(r => setTimeout(r, 150))

        const photo = captureFrame()
        if (photo) {
          capturedPhotosRef.current.push(photo)
          setLocalPhotos([...capturedPhotosRef.current])
        }

        setCountdown(null)
        if (shot < SHOTS_COUNT - 1) {
          await new Promise(r => setTimeout(r, PAUSE_BETWEEN_SHOTS))
        }
      }

      setSession(s => ({ ...s, screen: 'result', localPhotos: capturedPhotosRef.current }))
      return
    }

    // Paired mode - mark as ready
    if (!session.sessionCode || !sessionData) return

    await update(ref(database, `sessions/${session.sessionCode}`), {
      [session.role === 'host' ? 'hostReady' : 'guestReady']: true,
      lastUpdate: Date.now(),
    })
  }

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
      {isSoloMode ? (
        <div className="relative w-full max-w-4xl aspect-[16/9] bg-gray-900 rounded-lg overflow-hidden mb-8">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      ) : (
        <div className="w-full max-w-5xl mb-6 flex gap-4">
          {/* Your camera */}
          <div className="relative flex-1 aspect-[4/3] bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1 rounded-full">
              you
            </div>
          </div>

          {/* Partner's camera via WebRTC */}
          <div className="relative flex-1 aspect-[4/3] bg-gray-900 rounded-lg overflow-hidden">
            <video
              ref={partnerVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {webrtcState !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm bg-gray-900">
                {webrtcState === 'connecting' ? 'connecting...' : 'waiting for partner...'}
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1 rounded-full">
              partner
            </div>
          </div>
        </div>
      )}

      {/* Ready status */}
      {!isSoloMode && (
        <div className="mb-6 flex items-center gap-4 text-white text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${sessionData?.hostReady ? 'bg-green-500' : 'bg-white/30'}`} />
            <span className="text-white/70">{session.role === 'host' ? 'you' : 'partner'}</span>
          </div>
          <div className="text-white/30">+</div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${sessionData?.guestReady ? 'bg-green-500' : 'bg-white/30'}`} />
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
          {isSoloMode ? 'ready' : (isReady ? 'waiting...' : 'ready')}
        </button>
      )}

      {/* Progress dots */}
      <div className="flex gap-2 mt-6">
        {Array.from({ length: SHOTS_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < localPhotos.length ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
