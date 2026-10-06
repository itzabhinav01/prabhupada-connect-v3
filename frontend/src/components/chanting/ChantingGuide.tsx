import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Square, X } from 'lucide-react'

import { analyzeMeter, type Syllable } from './meter'

const WEIGHT_STYLES: Record<Syllable['weight'], string> = {
  laghu: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  guru: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
}
const WEIGHT_MARK: Record<Syllable['weight'], string> = {
  laghu: '˘',
  guru: '¯',
}

function SyllableChip({ syllable }: { syllable: Syllable }) {
  return (
    <span
      className={`inline-flex flex-col items-center justify-center border rounded-md px-2 py-1 min-w-[2.25rem] ${WEIGHT_STYLES[syllable.weight]}`}
      title={syllable.weight === 'laghu' ? 'Laghu (light, 1 mātrā)' : 'Guru (heavy, 2 mātrās)'}
    >
      <span className="text-sm font-medium">{syllable.text}</span>
      <span className="text-[10px] opacity-70 leading-none mt-0.5">{WEIGHT_MARK[syllable.weight]}</span>
    </span>
  )
}

function useMetronome(bpm: number, active: boolean) {
  const [tick, setTick] = useState(0)
  const ctxRef = useRef<AudioContext | null>(null)

  const playClick = () => {
    const ctx = (ctxRef.current ??= new AudioContext())
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
  }

  useEffect(() => {
    if (!active) return
    playClick()
    setTick((t) => t + 1)
    const intervalMs = 60000 / bpm
    const id = window.setInterval(() => {
      playClick()
      setTick((t) => t + 1)
    }, intervalMs)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, active])

  useEffect(() => {
    return () => {
      void ctxRef.current?.close()
    }
  }, [])

  return tick
}

export function ChantingGuide({
  transliteration,
  onClose,
}: {
  transliteration: string
  onClose: () => void
}) {
  const analysis = useMemo(() => analyzeMeter(transliteration), [transliteration])
  const [bpm, setBpm] = useState(70)
  const [playing, setPlaying] = useState(false)
  const tick = useMetronome(bpm, playing)

  // Rendered through a portal to document.body: this drawer uses
  // `position: fixed` to cover the viewport, but it lives inside VerseView,
  // which sits inside TanStack Virtual's `transform`-positioned item
  // wrapper — and a `transform` on any ancestor creates a new containing
  // block for `fixed` descendants, so without the portal this would be
  // pinned to that (scrolled, often off-screen) ancestor instead of the
  // real viewport.
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-neutral-950 border-l border-neutral-800 overflow-y-auto scrollbar-thin flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-base font-semibold text-neutral-100">Chant &amp; Meter</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-6 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${
                analysis.isRegular
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
            >
              {analysis.meterName}
            </span>
            <span className="text-xs text-neutral-500">{analysis.totalSyllables} syllables</span>
          </div>

          <div className="flex flex-col gap-4">
            {analysis.padas.map((pada, i) => (
              <div key={i}>
                <div className="text-[11px] uppercase tracking-wide text-neutral-600 mb-1.5">
                  Pāda {i + 1} · {pada.syllables.length} syllables
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pada.syllables.map((s, j) => (
                    <SyllableChip key={j} syllable={s} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4 border-t border-neutral-800">
            <div className="text-[11px] uppercase tracking-wide text-neutral-600 mb-2">
              Recitation pulse
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-800 text-neutral-200 hover:bg-neutral-700 text-sm"
              >
                {playing ? <Square size={14} /> : <Play size={14} />}
                {playing ? 'Stop' : 'Start'}
              </button>
              <input
                type="range"
                min={50}
                max={90}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-neutral-500 w-16 text-right tabular-nums">{bpm} BPM</span>
              <span
                key={tick}
                className={`w-3 h-3 rounded-full ${playing ? 'bg-amber-400 animate-ping' : 'bg-neutral-700'}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
