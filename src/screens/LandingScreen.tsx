import type { AppSession } from '../types'

type Props = {
  setSession: React.Dispatch<React.SetStateAction<AppSession>>
}

export function LandingScreen({ setSession }: Props) {
  const handleStart = () => {
    setSession((s) => ({ ...s, screen: 'choose' }))
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-between min-h-screen px-4 py-12">
      {/* Top section - Quote as greeting */}
      <p
        className="text-center text-xs tracking-widest uppercase"
        style={{ color: '#c4a484', letterSpacing: '0.2em' }}
      >
        for the ones we love
      </p>

      {/* Center section - Booth + Start */}
      <div className="flex flex-col items-center">
        {/* Booth design */}
        <div className="mb-6">
          <img
            src="/photobooth.svg"
            alt="photobooth"
            className="w-full max-w-[280px] sm:max-w-sm h-auto"
          />
        </div>

        {/* Quote */}
        <p
          className="text-center text-sm max-w-xs mb-8 leading-relaxed italic"
          style={{ fontFamily: "'Playfair Display', serif", color: '#a08870' }}
        >
          distance may separate us, but love always finds a way to close it.
        </p>

        {/* Start button */}
        <button
          onClick={handleStart}
          className="px-8 py-3 text-xs tracking-widest uppercase hover:opacity-70 transition-opacity"
          style={{
            color: '#8b7355',
            border: '1px solid #c4a484',
            borderRadius: '2px'
          }}
        >
          enter booth
        </button>
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
