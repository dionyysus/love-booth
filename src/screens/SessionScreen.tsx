import type { AppSession, SessionData } from '../types'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useWebRTC } from '../hooks/useWebRTC'
import { ref, onValue, update } from 'firebase/database'
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

  // Partner photos received via WebRTC data channel
  const partnerPhotosRef = useRef<string[]>([])

  // Callback for receiving photos from partner via data channel
  const handlePhotoReceived = useCallback((photo: string, index: number) => {
    partnerPhotosRef.current[index] = photo
  }, [])

  // WebRTC for real-time partner video and photo sharing
  const { remoteStream, state: webrtcState, sendPhoto } = useWebRTC(
    session.sessionCode,
    session.role,
    stream,
    handlePhotoReceived
  )
  const partnerVideoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
          // Wait a moment for any remaining photos to arrive via WebRTC
          setTimeout(() => {
            setSession((s) => ({
              ...s,
              screen: 'result',
              localPhotos: capturedPhotosRef.current,
              partnerPhotos: [...partnerPhotosRef.current], // Create a copy to ensure state update
            }))
          }, 1500) // Give photos time to transfer
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

  // Capture photo when countdown hits 0 - PAIRED MODE ONLY
  // Solo mode handles capture directly in handleReady to avoid race conditions
  useEffect(() => {
    if (isSoloMode) return // Solo mode captures in handleReady
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

    // Send photo to partner via WebRTC data channel
    const video = videoRef.current
    if (video) {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 750
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(-1, 1)
        ctx.drawImage(video, -600, 0, 600, 750)
        const compressed = canvas.toDataURL('image/jpeg', 0.85)
        sendPhoto(compressed, currentShot)
      }
    }
  }, [countdown, status, currentShot, captureFrame, isSoloMode, videoRef, sendPhoto])

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

      setSession(s => ({ ...s, screen: 'result', localPhotos: capturedPhotosRef.current, partnerPhotos: [] }))
      return
    }

    // Paired mode - mark as ready
    if (!session.sessionCode || !sessionData) return

    await update(ref(database, `sessions/${session.sessionCode}`), {
      [session.role === 'host' ? 'hostReady' : 'guestReady']: true,
      lastUpdate: Date.now(),
    })
  }

  // Handle photo upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const remainingSlots = SHOTS_COUNT - capturedPhotosRef.current.length
    const filesToProcess = Array.from(files).slice(0, remainingSlots)

    filesToProcess.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        if (dataUrl && capturedPhotosRef.current.length < SHOTS_COUNT) {
          const shotIndex = capturedPhotosRef.current.length
          capturedPhotosRef.current.push(dataUrl)
          setLocalPhotos([...capturedPhotosRef.current])

          // Send to partner via WebRTC data channel (if paired mode)
          if (!isSoloMode) {
            // Compress and send
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = 600
              canvas.height = 750
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(img, 0, 0, 600, 750)
                const compressed = canvas.toDataURL('image/jpeg', 0.85)
                sendPhoto(compressed, shotIndex)
              }
            }
            img.src = dataUrl
          }

          // If we have all 4 photos, go to result
          if (capturedPhotosRef.current.length >= SHOTS_COUNT) {
            if (isSoloMode) {
              setSession(s => ({ ...s, screen: 'result', localPhotos: capturedPhotosRef.current, partnerPhotos: [] }))
            }
          }
        }
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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

      {/* Ready button and upload option */}
      {!bothReady && !isCapturing && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleReady}
            disabled={isReady || status !== 'active'}
            className="px-12 py-4 bg-white text-black text-sm font-light tracking-widest hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isSoloMode ? 'ready' : (isReady ? 'waiting...' : 'ready')}
          </button>

          {/* Upload photos option */}
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span>or</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-white/70 hover:text-white underline transition-colors"
            >
              upload photos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </div>

          {/* Show uploaded count if any */}
          {localPhotos.length > 0 && (
            <p className="text-white/50 text-xs">
              {localPhotos.length} of {SHOTS_COUNT} photos added
            </p>
          )}
        </div>
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
