import type { AppSession } from '../types'
import { useEffect, useState, useRef } from 'react'
import { ref, remove, onValue } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function ResultScreen({ session, setSession }: Props) {
  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null)
  const [showPhoto, setShowPhoto] = useState(false)
  const [partnerPhotos, setPartnerPhotos] = useState<string[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isSoloMode = session.sessionCode === 'solo'

  // Load partner's photos from Firebase (for paired mode)
  useEffect(() => {
    if (isSoloMode || !session.sessionCode) return

    const partnerKey = session.role === 'host' ? 'guestPhotos' : 'hostPhotos'
    const photosRef = ref(database, `sessions/${session.sessionCode}/${partnerKey}`)

    const unsubscribe = onValue(photosRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val()
        // Convert object to array
        const photos = Object.values(data) as string[]
        setPartnerPhotos(photos)
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, session.role, isSoloMode])

  // Generate photo strip
  useEffect(() => {
    if (!canvasRef.current) return

    const myPhotos = session.localPhotos
    if (myPhotos.length === 0) return

    // For paired mode, wait for partner photos (max 4)
    if (!isSoloMode && partnerPhotos.length < Math.min(4, myPhotos.length)) {
      return // Wait for partner photos
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const photoWidth = 200
    const photoHeight = 250
    const padding = 20
    const photosToUse = Math.min(4, myPhotos.length)

    if (isSoloMode) {
      // Solo mode: single column
      canvas.width = photoWidth + padding * 2
      canvas.height = photoHeight * photosToUse + padding * 2
    } else {
      // Paired mode: two columns side by side
      canvas.width = photoWidth * 2 + padding * 2
      canvas.height = photoHeight * photosToUse + padding * 2
    }

    // White background
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Load and draw photos
    const loadPhotos = async () => {
      for (let i = 0; i < photosToUse; i++) {
        // My photo (left side in paired, center in solo)
        const myImg = await loadImage(myPhotos[i])
        const myX = isSoloMode ? padding : (session.role === 'host' ? padding : padding + photoWidth)
        ctx.drawImage(myImg, myX, padding + i * photoHeight, photoWidth, photoHeight)

        // Partner's photo (right side in paired mode)
        if (!isSoloMode && partnerPhotos[i]) {
          const partnerImg = await loadImage(partnerPhotos[i])
          const partnerX = session.role === 'host' ? padding + photoWidth : padding
          ctx.drawImage(partnerImg, partnerX, padding + i * photoHeight, photoWidth, photoHeight)
        }
      }

      // Convert to data URL
      setStripDataUrl(canvas.toDataURL('image/png'))
    }

    loadPhotos()
  }, [session.localPhotos, partnerPhotos, isSoloMode, session.role])

  // Animate photo delivery after strip is generated
  useEffect(() => {
    if (stripDataUrl) {
      const timer = setTimeout(() => {
        setShowPhoto(true)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [stripDataUrl])

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  const handleDownload = () => {
    if (!stripDataUrl) return

    const link = document.createElement('a')
    link.download = `photobooth-${Date.now()}.png`
    link.href = stripDataUrl
    link.click()
  }

  const handleNewSession = async () => {
    // Clean up old session
    if (session.sessionCode && session.sessionCode !== 'solo') {
      await remove(ref(database, `sessions/${session.sessionCode}`))
    }

    setSession({
      screen: 'landing',
      role: null,
      sessionCode: null,
      localPhotos: [],
    })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8">
      <canvas ref={canvasRef} className="hidden" />

      <h1 className="text-3xl font-light tracking-tight text-gray-900 mb-12">
        your photos
      </h1>

      {/* Photo delivery slot and strip */}
      <div className="relative flex flex-col items-center mb-12">
        {/* Photo slot */}
        <div className="relative z-10 w-full max-w-md">
          <img
            src="/photo-slot.png"
            alt="photo slot"
            className="w-full h-auto"
          />
        </div>

        {/* Photo strip sliding out */}
        {stripDataUrl && (
          <div
            className="relative -mt-4 shadow-2xl transition-all duration-1000 ease-out"
            style={{
              transform: showPhoto ? 'translateY(0)' : 'translateY(-100%)',
              opacity: showPhoto ? 1 : 0,
            }}
          >
            <img
              src={stripDataUrl}
              alt="photo strip"
              className="max-w-full h-auto"
              style={{ maxHeight: '60vh' }}
            />
          </div>
        )}

        {/* Loading spinner */}
        {!stripDataUrl && (
          <div className="mt-8 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Actions */}
      {showPhoto && (
        <div className="flex gap-4 transition-opacity duration-500">
          <button
            onClick={handleDownload}
            className="px-8 py-3 bg-black text-white text-sm font-light tracking-wide hover:bg-gray-800 transition-colors"
          >
            download
          </button>
          <button
            onClick={handleNewSession}
            className="px-8 py-3 border border-gray-300 text-gray-900 text-sm font-light tracking-wide hover:border-black transition-colors"
          >
            new session
          </button>
        </div>
      )}
    </div>
  )
}
