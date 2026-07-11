import { useEffect, useRef } from 'react'

// #14: a Google-Maps-style start/end time picker. Each column is a snap-scroll
// "wheel" of 30-minute steps with the centered row highlighted.
const STEP_MIN = 30
// #30: compact rows so the wheel reads as a control, not a dominating panel.
// Below the 44px min tap target intentionally — rows also scroll and respond to
// arrow keys, and each row stays a full-width hit area.
const ITEM_H = 36 // px
const OPTIONS: number[] = Array.from(
  { length: (24 * 60) / STEP_MIN },
  (_, i) => i * STEP_MIN,
)

function toLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
    minutes % 60,
  ).padStart(2, '0')}`
}

function nearestIndex(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const minutes = (h || 0) * 60 + (m || 0)
  let best = 0
  let bestDelta = Infinity
  OPTIONS.forEach((opt, i) => {
    const delta = Math.abs(opt - minutes)
    if (delta < bestDelta) {
      bestDelta = delta
      best = i
    }
  })
  return best
}

function Wheel({
  label,
  value,
  onSelect,
}: {
  label: string
  value: string
  onSelect: (hhmm: string) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const index = nearestIndex(value)

  useEffect(() => {
    const el = viewportRef.current
    if (el) el.scrollTop = index * ITEM_H
  }, [index])

  const onScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const el = viewportRef.current
      if (!el) return
      const i = Math.min(
        OPTIONS.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_H)),
      )
      const hhmm = toHHMM(OPTIONS[i])
      if (hhmm !== value) onSelect(hhmm)
      else el.scrollTop = i * ITEM_H
    }, 140)
  }

  const step = (delta: number) => {
    const next = Math.min(OPTIONS.length - 1, Math.max(0, index + delta))
    onSelect(toHHMM(OPTIONS[next]))
  }

  return (
    <div className="time-wheel">
      <div className="mb-1 text-xs font-semibold text-foreground">{label}</div>
      <div className="time-wheel__frame">
        <div
          ref={viewportRef}
          className="time-wheel__viewport"
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              step(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              step(-1)
            }
          }}
        >
          <div style={{ height: ITEM_H }} aria-hidden="true" />
          {OPTIONS.map((minutes, i) => (
            <button
              key={minutes}
              type="button"
              role="option"
              aria-selected={i === index}
              className={`time-wheel__item ${i === index ? 'is-active' : ''}`}
              style={{ height: ITEM_H }}
              onClick={() => onSelect(toHHMM(minutes))}
            >
              {toLabel(minutes)}
            </button>
          ))}
          <div style={{ height: ITEM_H }} aria-hidden="true" />
        </div>
        <div className="time-wheel__band" aria-hidden="true" />
      </div>
    </div>
  )
}

export default function TimeRangeWheel({
  from,
  to,
  onChange,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Time range">
      <Wheel label="Start" value={from} onSelect={(next) => onChange(next, to)} />
      <Wheel label="End" value={to} onSelect={(next) => onChange(from, next)} />
    </div>
  )
}
