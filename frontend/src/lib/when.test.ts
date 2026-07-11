import { describe, expect, it } from 'vitest'
import { createPresetWhen, isValidCustomWindow, toDayCode } from './when'

describe('session timing', () => {
  const now = new Date('2026-07-10T09:00:00-07:00')

  it('builds lunch and dinner windows from presets', () => {
    expect(createPresetWhen('today_lunch', now)).toMatchObject({
      date: '2026-07-10',
      day: 'fri',
      time_from: '11:00',
      time_to: '14:00',
      label: 'Today · lunch',
    })
    expect(createPresetWhen('tomorrow_dinner', now)).toMatchObject({
      date: '2026-07-11',
      day: 'sat',
      time_from: '17:00',
      time_to: '21:00',
    })
  })

  it('selects the next Saturday, including the current day', () => {
    expect(createPresetWhen('saturday', now).date).toBe('2026-07-11')
    expect(createPresetWhen('saturday', new Date('2026-07-11T08:00:00-07:00')).date).toBe(
      '2026-07-11',
    )
  })

  it('maps browser weekday values to contract day codes', () => {
    expect(toDayCode(new Date('2026-07-12T12:00:00-07:00'))).toBe('sun')
  })

  it('rejects empty or malformed custom date and time values', () => {
    expect(isValidCustomWindow('', '11:00', '14:00')).toBe(false)
    expect(isValidCustomWindow('2026-02-31', '11:00', '14:00')).toBe(false)
    expect(isValidCustomWindow('2026-07-11', '', '14:00')).toBe(false)
    expect(isValidCustomWindow('2026-07-11', '20:00', '01:00')).toBe(true)
  })
})
