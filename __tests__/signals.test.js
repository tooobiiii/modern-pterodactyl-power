/**
 * Unit tests for src/signals.js
 */
import { POWER_SIGNALS, parsePowerSignal } from '../src/signals.js'

describe('signals.js', () => {
  it.each(POWER_SIGNALS)('accepts the "%s" signal', (signal) => {
    expect(parsePowerSignal(signal)).toBe(signal)
  })

  it('normalizes casing and surrounding whitespace', () => {
    expect(parsePowerSignal('  ReStArT ')).toBe('restart')
  })

  it.each([['reboot'], [''], [undefined], [null]])('rejects %p', (value) => {
    expect(() => parsePowerSignal(value)).toThrow(
      /Expected one of: start, stop, restart, kill/
    )
  })
})
