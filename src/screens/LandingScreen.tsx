import type { AppSession } from '../types'

type Props = {
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function LandingScreen({ setSession }: Props) {
  const handleStart = () => {
    setSession((s) => ({ ...s, screen: 'choose' }))
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen px-4 py-8">
      {/* Your booth design */}
      <div className="mb-8">
        <img
          src="/photobooth.svg"
          alt="photobooth"
          className="w-full max-w-sm h-auto"
        />
      </div>

      {/* Quote */}
      <p
        className="text-center text-sm sm:text-base max-w-xs mb-12 leading-relaxed"
        style={{ fontFamily: "'Playfair Display', serif", color: '#a08870' }}
      >
        distance may separate us, but love always finds a way to close it.
      </p>

      {/* Start button */}
      <button
        onClick={handleStart}
        className="px-12 py-4 bg-gray-900 text-white text-sm font-light tracking-widest rounded-full hover:bg-gray-700 transition-colors"
      >
        start
      </button>

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
