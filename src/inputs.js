import * as core from '@actions/core'
import { PowerSignals, parsePowerSignal } from './signals.js'

/**
 * Pterodactyl accepts both the short identifier (`d3aac109`) and the full
 * server UUID. Both are alphanumeric with dashes, so anything else is either a
 * typo or an attempt to break out of the API path.
 */
const SERVER_ID_PATTERN = /^[A-Za-z0-9-]+$/

/**
 * @typedef {object} ActionInputs
 * @property {string} panelUrl Panel origin without a trailing slash.
 * @property {string} bearerToken Client API key.
 * @property {string} serverId Server identifier or UUID.
 * @property {string} signal Normalized power signal.
 */

/**
 * Reads and validates every input declared in `action.yml`.
 *
 * @returns {ActionInputs} The validated inputs.
 * @throws {Error} If a required input is missing or malformed.
 */
export function readInputs() {
  return {
    panelUrl: parsePanelUrl(core.getInput('panel-url', { required: true })),
    bearerToken: parseBearerToken(
      core.getInput('bearer-token', { required: true })
    ),
    serverId: parseServerId(core.getInput('server-id', { required: true })),
    signal: parsePowerSignal(core.getInput('action') || PowerSignals.RESTART)
  }
}

/**
 * @param {string} value Raw `panel-url` input.
 * @returns {string} The panel base URL, without a trailing slash.
 */
function parsePanelUrl(value) {
  let url

  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(
      `"panel-url" is not a valid URL: "${value}". Expected something like https://panel.example.com.`
    )
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(
      `"panel-url" must use http or https, received "${url.protocol}".`
    )
  }

  // Panels behind a reverse proxy can live under a sub path, so keep it.
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/**
 * @param {string} value Raw `bearer-token` input.
 * @returns {string} The trimmed token.
 */
function parseBearerToken(value) {
  const token = value.trim()

  if (token === '') {
    throw new Error('"bearer-token" must not be empty.')
  }

  return token
}

/**
 * @param {string} value Raw `server-id` input.
 * @returns {string} The trimmed server identifier.
 */
function parseServerId(value) {
  const serverId = value.trim()

  if (!SERVER_ID_PATTERN.test(serverId)) {
    throw new Error(
      `"server-id" must be a Pterodactyl server identifier or UUID, received "${value}".`
    )
  }

  return serverId
}
