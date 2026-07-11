import type { DayCode, SessionWhen, WhenPreset } from '../types/contract'

const DAY_CODES: DayCode[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function toDayCode(date: Date): DayCode {
  return DAY_CODES[date.getDay()]
}

export function toLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function plusDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function createPresetWhen(
  preset: Exclude<WhenPreset, 'custom'>,
  now = new Date(),
): SessionWhen {
  let date = now
  let timeFrom = '11:00'
  let timeTo = '14:00'
  let label = 'Today · lunch'

  if (preset === 'tomorrow_dinner') {
    date = plusDays(now, 1)
    timeFrom = '17:00'
    timeTo = '21:00'
    label = 'Tomorrow · dinner'
  } else if (preset === 'saturday') {
    date = plusDays(now, (6 - now.getDay() + 7) % 7)
    timeFrom = '11:00'
    timeTo = '15:00'
    label = 'Saturday'
  }

  return {
    preset,
    date: toLocalDate(date),
    day: toDayCode(date),
    time_from: timeFrom,
    time_to: timeTo,
    label,
  }
}

export function createCustomWhen(
  date: string,
  timeFrom: string,
  timeTo: string,
): SessionWhen {
  const parsed = new Date(`${date}T12:00:00`)
  return {
    preset: 'custom',
    date,
    day: Number.isNaN(parsed.getTime()) ? 'fri' : toDayCode(parsed),
    time_from: timeFrom,
    time_to: timeTo,
    label: `Custom · ${timeFrom}–${timeTo}`,
  }
}

export function isValidCustomWindow(
  date: string,
  timeFrom: string,
  timeTo: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  if (!/^\d{2}:\d{2}$/.test(timeFrom) || !/^\d{2}:\d{2}$/.test(timeTo)) return false
  const parsed = new Date(`${date}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && toLocalDate(parsed) === date
}
