import type { AppSession } from '../types'
import { useEffect, useState, useRef, useCallback } from 'react'
import { ref, remove, onValue } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

type PhotoEffect = 'original' | 'vintage' | 'bw'

export function ResultScreen({ session, setSession }: Props) {
  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null)
  const [showPhoto, setShowPhoto] = useState(false)
  const [partnerPhotos, setPartnerPhotos] = useState<string[]>([])
  const [effect, setEffect] = useState<PhotoEffect>('original')
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
        const photos = Object.values(data) as string[]
        setPartnerPhotos(photos)
      }
    })

    return () => unsubscribe()
  }, [session.sessionCode, session.role, isSoloMode])

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  // Draw image with crop (cover) instead of stretch
  const drawImageCover = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const imgRatio = img.width / img.height
    const targetRatio = width / height

    let sourceX = 0
    let sourceY = 0
    let sourceWidth = img.width
    let sourceHeight = img.height

    if (imgRatio > targetRatio) {
      // Image is wider - crop sides
      sourceWidth = img.height * targetRatio
      sourceX = (img.width - sourceWidth) / 2
    } else {
      // Image is taller - crop top/bottom
      sourceHeight = img.width / targetRatio
      sourceY = (img.height - sourceHeight) / 2
    }

    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle (crop)
      x, y, width, height // Destination rectangle
    )
  }

  // Apply classic black & white effect (pure B&W with contrast)
  const applyBWEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    const imageData = ctx.getImageData(x, y, width, height)
    const data = imageData.data

    const centerX = width / 2
    const centerY = height / 2
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY)

    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4
      const px = pixelIndex % width
      const py = Math.floor(pixelIndex / width)

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Convert to grayscale
      let gray = (r * 0.299) + (g * 0.587) + (b * 0.114)

      // Calculate distance from center for subtle vignette
      const dx = px - centerX
      const dy = py - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const normalizedDist = dist / maxDist
      const vignette = 1 - (normalizedDist * normalizedDist * 0.2)

      gray = gray * vignette

      // Increase contrast
      gray = ((gray - 128) * 1.15) + 128
      gray = Math.max(0, Math.min(255, gray))

      // Pure black and white - no tint
      data[i] = gray
      data[i + 1] = gray
      data[i + 2] = gray
    }

    ctx.putImageData(imageData, x, y)
  }

  // Apply vintage photobooth effect (Booth by Bryant style - warm sepia B&W with film quality)
  const applyVintageEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    const imageData = ctx.getImageData(x, y, width, height)
    const data = imageData.data

    const centerX = width / 2
    const centerY = height / 2
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY)

    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4
      const px = pixelIndex % width
      const py = Math.floor(pixelIndex / width)

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Convert to grayscale with film-like luminance
      let gray = (r * 0.299) + (g * 0.587) + (b * 0.114)

      // Subtle vignette - very soft edge darkening
      const dx = px - centerX
      const dy = py - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const normalizedDist = dist / maxDist
      const vignette = 1 - (normalizedDist * normalizedDist * 0.12)

      gray = gray * vignette

      // Bold contrast for flash photography look
      gray = ((gray - 128) * 1.25) + 128
      gray = Math.max(0, Math.min(255, gray))

      // Very subtle film grain
      const grain = (Math.random() - 0.5) * 8
      gray = Math.max(0, Math.min(255, gray + grain))

      // Warm sepia toning (50-60% warmth as per Booth by Bryant style)
      // Apply sepia by adding warm tones - more red, some green, less blue
      let newR = gray * 1.08  // Boost red channel
      let newG = gray * 1.02  // Slight green boost
      let newB = gray * 0.88  // Reduce blue for warmth

      // Clamp values
      data[i] = Math.max(0, Math.min(255, newR))
      data[i + 1] = Math.max(0, Math.min(255, newG))
      data[i + 2] = Math.max(0, Math.min(255, newB))
    }

    ctx.putImageData(imageData, x, y)
  }

  // Generate photo strip
  const generateStrip = useCallback(async () => {
    if (!canvasRef.current) return

    const myPhotos = session.localPhotos
    if (myPhotos.length === 0) return

    if (!isSoloMode && partnerPhotos.length < Math.min(4, myPhotos.length)) {
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const photoWidth = 600
    const photoHeight = 750
    const padding = 40
    const photosToUse = Math.min(4, myPhotos.length)

    if (isSoloMode) {
      canvas.width = photoWidth + padding * 2
      canvas.height = photoHeight * photosToUse + padding * 2
    } else {
      canvas.width = photoWidth * 2 + padding * 2
      canvas.height = photoHeight * photosToUse + padding * 2
    }

    // Black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < photosToUse; i++) {
      const myImg = await loadImage(myPhotos[i])
      const myX = isSoloMode ? padding : (session.role === 'host' ? padding : padding + photoWidth)
      drawImageCover(ctx, myImg, myX, padding + i * photoHeight, photoWidth, photoHeight)

      // Apply effect if selected
      if (effect === 'vintage') {
        applyVintageEffect(ctx, myX, padding + i * photoHeight, photoWidth, photoHeight)
      } else if (effect === 'bw') {
        applyBWEffect(ctx, myX, padding + i * photoHeight, photoWidth, photoHeight)
      }

      if (!isSoloMode && partnerPhotos[i]) {
        const partnerImg = await loadImage(partnerPhotos[i])
        const partnerX = session.role === 'host' ? padding + photoWidth : padding
        drawImageCover(ctx, partnerImg, partnerX, padding + i * photoHeight, photoWidth, photoHeight)

        // Apply effect if selected
        if (effect === 'vintage') {
          applyVintageEffect(ctx, partnerX, padding + i * photoHeight, photoWidth, photoHeight)
        } else if (effect === 'bw') {
          applyBWEffect(ctx, partnerX, padding + i * photoHeight, photoWidth, photoHeight)
        }
      }
    }

    setStripDataUrl(canvas.toDataURL('image/png'))
  }, [session.localPhotos, partnerPhotos, isSoloMode, session.role, effect])

  // Generate strip when photos or effect changes
  useEffect(() => {
    generateStrip()
  }, [generateStrip])

  // Animate photo appearance
  useEffect(() => {
    if (stripDataUrl) {
      const timer = setTimeout(() => {
        setShowPhoto(true)
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [stripDataUrl])

  const handleDownload = () => {
    if (!stripDataUrl) return

    const link = document.createElement('a')
    link.download = `photobooth-${effect}-${Date.now()}.png`
    link.href = stripDataUrl
    link.click()
  }

  const handleNewSession = async () => {
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
    <div
      className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8"
      style={{ backgroundColor: '#faf8f5' }}
    >
      <canvas ref={canvasRef} className="hidden" />

      {/* Title */}
      <h1
        className="text-2xl sm:text-3xl font-normal tracking-wide mb-6"
        style={{ fontFamily: "'Playfair Display', serif", color: '#8b7355' }}
      >
        your photos
      </h1>

      {/* Effect selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setEffect('original')}
          className={`px-4 py-2 text-xs font-light tracking-wide rounded-full transition-all ${
            effect === 'original'
              ? 'bg-gray-900 text-white'
              : 'bg-transparent text-gray-500 border border-gray-300'
          }`}
        >
          original
        </button>
        <button
          onClick={() => setEffect('bw')}
          className={`px-4 py-2 text-xs font-light tracking-wide rounded-full transition-all ${
            effect === 'bw'
              ? 'bg-gray-700 text-white'
              : 'bg-transparent text-gray-500 border border-gray-300'
          }`}
        >
          b&w
        </button>
        <button
          onClick={() => setEffect('vintage')}
          className={`px-4 py-2 text-xs font-light tracking-wide rounded-full transition-all ${
            effect === 'vintage'
              ? 'text-white'
              : 'bg-transparent border'
          }`}
          style={{
            backgroundColor: effect === 'vintage' ? '#8b7355' : 'transparent',
            borderColor: effect === 'vintage' ? '#8b7355' : '#c4a484',
            color: effect === 'vintage' ? 'white' : '#8b7355'
          }}
        >
          vintage
        </button>
      </div>

      {/* Photo frame box */}
      <div
        className="relative rounded-3xl p-4 sm:p-6 mb-8 transition-all duration-500"
        style={{
          backgroundColor: '#e8e0d5',
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.15), inset 0 1px 0 rgba(255,255,255,0.5)'
        }}
      >
        {/* Inner frame */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: '#3d3630',
            padding: '12px',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {stripDataUrl ? (
            <div
              className="transition-all duration-[2000ms] ease-out"
              style={{
                transform: showPhoto ? 'translateY(0)' : 'translateY(-100%)',
                opacity: showPhoto ? 1 : 0,
              }}
            >
              <img
                src={stripDataUrl}
                alt="photo strip"
                className="rounded-lg"
                style={{ maxHeight: '50vh', width: 'auto' }}
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                height: '300px',
                width: '200px',
                backgroundColor: '#2a2520'
              }}
            >
              <div
                className="w-8 h-8 border-2 rounded-full animate-spin"
                style={{ borderColor: '#8b7355', borderTopColor: '#c4a484' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {showPhoto && (
        <div className="flex gap-4 transition-opacity duration-500">
          <button
            onClick={handleDownload}
            className="px-8 py-3 text-white text-sm font-light tracking-wide rounded-full hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#8b7355' }}
          >
            download
          </button>
          <button
            onClick={handleNewSession}
            className="px-8 py-3 text-sm font-light tracking-wide rounded-full transition-colors"
            style={{
              color: '#8b7355',
              border: '1px solid #c4a484'
            }}
          >
            new session
          </button>
        </div>
      )}

      {/* Footer */}
      <p
        className="mt-12 text-xs tracking-wide"
        style={{ color: '#c4a484' }}
      >
        made with love
      </p>
    </div>
  )
}
