/**
 * Power signals accepted by the Pterodactyl client API.
 *
 * @see https://pterodactyl-api-docs.netvpx.com/docs/api/client/servers#power-management
 */
export const PowerSignals = Object.freeze({
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart',
  KILL: 'kill'
})

/** @type {readonly string[]} Every signal the panel understands. */
export const POWER_SIGNALS = Object.freeze(Object.values(PowerSignals))

/**
 * Normalizes user input into a signal the panel accepts.
 *
 * @param {string} value Raw input value, in any casing.
 * @returns {string} The normalized signal.
 * @throws {Error} If the value is not a supported power signal.
 */
export function parsePowerSignal(value) {
  const signal = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!POWER_SIGNALS.includes(signal)) {
    throw new Error(
      `Unsupported power action "${value}". Expected one of: ${POWER_SIGNALS.join(', ')}.`
    )
  }

  return signal
}
