import type { AppSession } from '../types'
import { useEffect, useState, useRef, useCallback } from 'react'
import { ref, remove } from 'firebase/database'
import { database } from '../lib/firebase'

type Props = {
  session: AppSession
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

type PhotoEffect = 'original' | 'vintage' | 'bw'

export function ResultScreen({ session, setSession }: Props) {
  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null)
  const [showPhoto, setShowPhoto] = useState(false)
  const [effect, setEffect] = useState<PhotoEffect>('original')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isInitialLoad = useRef(true)
  const [hasAnimated, setHasAnimated] = useState(false)

  const isSoloMode = session.sessionCode === 'solo'

  // Partner photos come from session state (sent via WebRTC data channel)
  const partnerPhotos = session.partnerPhotos

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

    // Count actual partner photos (not undefined values)
    const actualPartnerPhotos = partnerPhotos.filter(p => p).length
    if (!isSoloMode && actualPartnerPhotos < Math.min(4, myPhotos.length)) {
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

  // Generate strip - with delay only on initial load
  useEffect(() => {
    if (isInitialLoad.current) {
      const timer = setTimeout(() => {
        generateStrip()
      }, 500)
      return () => clearTimeout(timer)
    } else {
      generateStrip()
    }
  }, [generateStrip])

  // Show photo after strip is ready
  useEffect(() => {
    if (stripDataUrl) {
      if (isInitialLoad.current) {
        const timer = setTimeout(() => {
          setShowPhoto(true)
          isInitialLoad.current = false
          // Mark animation as complete after it finishes
          setTimeout(() => setHasAnimated(true), 2000)
        }, 1000)
        return () => clearTimeout(timer)
      } else {
        setShowPhoto(true)
      }
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
      partnerPhotos: [],
    })
  }

  return (
    <div
      className="flex flex-1 flex-col items-center justify-between min-h-screen px-4 py-12"
      style={{ backgroundColor: '#faf8f5' }}
    >
      <canvas ref={canvasRef} className="hidden" />

      {/* Top spacer */}
      <div />

      {/* Center section */}
      <div className="flex flex-col items-center">
        {/* Title */}
        <h1
          className="text-xl sm:text-2xl font-normal tracking-wide mb-6 italic"
          style={{ fontFamily: "'Playfair Display', serif", color: '#8b7355' }}
        >
          photos delivered
        </h1>

        {/* Effect selector */}
        <div className="flex gap-6 mb-6">
          <button
            onClick={() => setEffect('original')}
            className="text-xs tracking-wide transition-all"
            style={{
              color: effect === 'original' ? '#8b7355' : '#a08870',
              textDecoration: effect === 'original' ? 'underline' : 'none',
              textUnderlineOffset: '4px'
            }}
          >
            original
          </button>
          <button
            onClick={() => setEffect('bw')}
            className="text-xs tracking-wide transition-all"
            style={{
              color: effect === 'bw' ? '#8b7355' : '#a08870',
              textDecoration: effect === 'bw' ? 'underline' : 'none',
              textUnderlineOffset: '4px'
            }}
          >
            b&w
          </button>
          <button
            onClick={() => setEffect('vintage')}
            className="text-xs tracking-wide transition-all"
            style={{
              color: effect === 'vintage' ? '#8b7355' : '#a08870',
              textDecoration: effect === 'vintage' ? 'underline' : 'none',
              textUnderlineOffset: '4px'
            }}
          >
            vintage
          </button>
        </div>

        {/* Photobooth Machine */}
        <div className="relative mb-8">
          {/* Machine Body */}
          <div
            className="relative"
            style={{
              backgroundColor: '#d4c4b0',
              borderRadius: '12px 12px 0 0',
              padding: '20px 24px 0 24px',
              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.1)',
              minWidth: '280px',
            }}
          >
            {/* Machine top decoration */}
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-2 rounded-full"
              style={{ backgroundColor: '#b8a896' }}
            />

            {/* Machine label */}
            <p
              className="text-center text-xs tracking-widest uppercase mt-4 mb-4"
              style={{ color: '#8b7355', letterSpacing: '0.15em' }}
            >
              photobooth
            </p>

            {/* Slot area - where photo comes out */}
            <div
              className="relative overflow-hidden flex justify-center"
              style={{
                backgroundColor: '#2a2520',
                borderRadius: '4px 4px 0 0',
                padding: '8px 8px 0 8px',
                minHeight: '45vh',
              }}
            >
              {stripDataUrl && showPhoto ? (
                <div className={!hasAnimated ? 'animate-slide-down' : ''}>
                  <img
                    src={stripDataUrl}
                    alt="photo strip"
                    style={{ maxHeight: '50vh', width: 'auto', borderRadius: '2px 2px 0 0' }}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center justify-center w-full"
                  style={{ height: '45vh' }}
                >
                  <div
                    className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: '#5a4a3a', borderTopColor: '#c4a484' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Machine base / photo exit */}
          <div
            style={{
              backgroundColor: '#c4b4a0',
              height: '16px',
              borderRadius: '0 0 8px 8px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
            }}
          />
        </div>

        {/* Actions */}
        {showPhoto && (
          <div className="flex gap-6 transition-opacity duration-500">
            <button
              onClick={handleDownload}
              className="text-xs tracking-widest uppercase underline underline-offset-4 hover:opacity-70 transition-opacity"
              style={{ color: '#8b7355' }}
            >
              download
            </button>
            <button
              onClick={handleNewSession}
              className="text-xs tracking-widest uppercase underline underline-offset-4 hover:opacity-70 transition-opacity"
              style={{ color: '#a08870' }}
            >
              new session
            </button>
          </div>
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
