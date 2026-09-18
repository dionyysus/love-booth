import type { AppSession, SessionData } from '../types'
import { useEffect, useState, useRef } from 'react'
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
  const [partnerPreview, setPartnerPreview] = useState<string | null>(null)
  const isCapturingRef = useRef(false)
  const capturedPhotosRef = useRef<string[]>([])
  const lastCapturedShotRef = useRef<number>(-1)

  const isSoloMode = session.sessionCode === 'solo'

  // Start camera
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Send live preview to partner
  useEffect(() => {
    if (!session.sessionCode || isSoloMode || status !== 'active') return

    const sendPreview = () => {
      const frame = captureFrame()
      if (frame) {
        const canvas = document.createElement('canvas')
        const img = new Image()
        img.onload = () => {
          canvas.width = 120
          canvas.height = 90
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, 120, 90)
            const compressed = canvas.toDataURL('image/jpeg', 0.3)
            const previewKey = session.role === 'host' ? 'hostPreview' : 'guestPreview'
            set(ref(database, `sessions/${session.sessionCode}/${previewKey}`), compressed)
          }
        }
        img.src = frame
      }
    }

    const interval = setInterval(sendPreview, 300)
    return () => clearInterval(interval)
  }, [session.sessionCode, session.role, isSoloMode, status, captureFrame])

  // Listen for partner's preview
  useEffect(() => {
    if (!session.sessionCode || isSoloMode) return

    const partnerKey = session.role === 'host' ? 'guestPreview' : 'hostPreview'
    const previewRef = ref(database, `sessions/${session.sessionCode}/${partnerKey}`)

    const unsubscribe = onValue(previewRef, (snapshot) => {
      if (snapshot.exists()) {
        setPartnerPreview(snapshot.val())
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, session.role, isSoloMode])

  // Listen for session updates
  useEffect(() => {
    if (!session.sessionCode || isSoloMode) return

    const sessionRef = ref(database, `sessions/${session.sessionCode}`)
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const parsed: SessionData = snapshot.val()
        setSessionData(parsed)

        if (parsed.status === 'capturing') {
          setCountdown(parsed.countdown)
          setCurrentShot(parsed.currentShot)
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

  // START CAPTURE - This triggers when both are ready (HOST ONLY)
  useEffect(() => {
    if (isSoloMode) return
    if (session.role !== 'host') return
    if (!sessionData) return
    if (!sessionData.hostReady || !sessionData.guestReady) return
    if (sessionData.status !== 'waiting') return
    if (isCapturingRef.current) return

    // Both ready! Start capture sequence
    const runCapture = async () => {
      isCapturingRef.current = true
      capturedPhotosRef.current = []
      lastCapturedShotRef.current = -1

      const sessionRef = ref(database, `sessions/${session.sessionCode}`)

      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        // Countdown 3-2-1
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          await set(sessionRef, {
            ...sessionData,
            countdown: i,
            currentShot: shot,
            status: 'capturing',
            lastUpdate: Date.now(),
          })
          await new Promise(r => setTimeout(r, 1000))
        }

        // Capture moment (countdown = 0)
        await set(sessionRef, {
          ...sessionData,
          countdown: 0,
          currentShot: shot,
          status: 'capturing',
          lastUpdate: Date.now(),
        })

        await new Promise(r => setTimeout(r, 500))

        if (shot < SHOTS_COUNT - 1) {
          await new Promise(r => setTimeout(r, PAUSE_BETWEEN_SHOTS))
        }
      }

      // Done!
      await set(sessionRef, {
        ...sessionData,
        countdown: null,
        currentShot: SHOTS_COUNT,
        status: 'complete',
        lastUpdate: Date.now(),
      })

      isCapturingRef.current = false
    }

    runCapture()
  }, [sessionData, session.role, session.sessionCode, isSoloMode])

  // Capture photo when countdown hits 0
  useEffect(() => {
    if (countdown !== 0) return
    if (status !== 'active') return
    if (currentShot === lastCapturedShotRef.current) return

    lastCapturedShotRef.current = currentShot
    const photo = captureFrame()

    if (photo) {
      capturedPhotosRef.current.push(photo)
      setLocalPhotos(prev => [...prev, photo])

      // Upload to Firebase for partner
      if (session.sessionCode && !isSoloMode) {
        const photoKey = session.role === 'host' ? 'hostPhotos' : 'guestPhotos'
        const canvas = document.createElement('canvas')
        const img = new Image()
        img.onload = () => {
          canvas.width = 200
          canvas.height = 250
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, 200, 250)
            const compressed = canvas.toDataURL('image/jpeg', 0.5)
            set(ref(database, `sessions/${session.sessionCode}/${photoKey}/${currentShot}`), compressed)
          }
        }
        img.src = photo
      }
    }
  }, [countdown, status, currentShot, captureFrame, session.sessionCode, session.role, isSoloMode])

  // Handle ready button
  const handleReady = async () => {
    setIsReady(true)

    if (isSoloMode) {
      // Solo capture
      isCapturingRef.current = true
      capturedPhotosRef.current = []

      for (let shot = 0; shot < SHOTS_COUNT; shot++) {
        setCurrentShot(shot)
        for (let i = COUNTDOWN_SECONDS; i > 0; i--) {
          setCountdown(i)
          await new Promise(r => setTimeout(r, 1000))
        }
        setCountdown(0)
        await new Promise(r => setTimeout(r, 100))

        const photo = captureFrame()
        if (photo) {
          capturedPhotosRef.current.push(photo)
          setLocalPhotos(prev => [...prev, photo])
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

    await set(ref(database, `sessions/${session.sessionCode}`), {
      ...sessionData,
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

      {/* Camera preview - SIDE BY SIDE for paired mode */}
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
        <div className="w-full max-w-5xl mb-6 flex gap-3">
          {/* Your camera */}
          <div className="relative flex-1 aspect-[4/3] bg-gray-800 rounded-lg overflow-hidden">
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

          {/* Partner's camera */}
          <div className="relative flex-1 aspect-[4/3] bg-gray-800 rounded-lg overflow-hidden">
            {partnerPreview ? (
              <img
                src={partnerPreview}
                alt="partner"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
                waiting for partner...
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
