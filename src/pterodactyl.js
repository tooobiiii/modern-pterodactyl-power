import * as core from '@actions/core'

/** The client API is versioned through the Accept header, not the path. */
const ACCEPT_HEADER = 'application/vnd.pterodactyl.v1+json'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 1_000

/** Transient failures: rate limiting and panel/proxy hiccups. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * @typedef {object} ClientOptions
 * @property {string} panelUrl Panel base URL, without a trailing slash.
 * @property {string} bearerToken Client API key.
 * @property {typeof fetch} [fetchImpl] Injectable fetch, for tests.
 * @property {(ms: number) => Promise<void>} [sleepImpl] Injectable sleep, for tests.
 * @property {number} [timeoutMs] Per-request timeout.
 * @property {number} [retries] Retry attempts for transient failures.
 * @property {number} [retryDelayMs] Base delay for the exponential backoff.
 */

/**
 * @typedef {object} PterodactylClient
 * @property {(serverId: string, signal: string) => Promise<void>} sendPowerSignal
 * @property {(serverId: string) => Promise<string>} getServerState
 */

/**
 * Creates a client for the Pterodactyl client API.
 *
 * @param {ClientOptions} options Connection and resilience options.
 * @returns {PterodactylClient} The client.
 */
export function createPterodactylClient({
  panelUrl,
  bearerToken,
  fetchImpl = fetch,
  sleepImpl = sleep,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
}) {
  /**
   * Performs a request against the client API, retrying transient failures.
   *
   * @param {string} path API path, relative to the panel base URL.
   * @param {RequestInit} [init] Additional fetch options.
   * @returns {Promise<Response>} The successful response.
   */
  async function request(path, init = {}) {
    const url = `${panelUrl}${path}`
    let lastError

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const delay = retryDelayMs * 2 ** (attempt - 1)
        core.info(
          `Retrying in ${delay}ms (attempt ${attempt + 1} of ${retries + 1})...`
        )
        await sleepImpl(delay)
      }

      try {
        core.debug(`${init.method ?? 'GET'} ${url}`)

        const response = await fetchImpl(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            Accept: ACCEPT_HEADER,
            'Content-Type': 'application/json',
            ...init.headers
          },
          signal: AbortSignal.timeout(timeoutMs)
        })

        if (response.ok) return response

        throw new PterodactylApiError(
          await describeErrorResponse(response),
          response.status
        )
      } catch (error) {
        const isApiError = error instanceof PterodactylApiError

        lastError = isApiError
          ? error
          : new Error(`Request to ${url} failed: ${error.message}`, {
              cause: error
            })

        // Anything that is not a response — DNS, TLS, timeouts — is worth
        // another try; API errors only when the panel says they are transient.
        if (isApiError && !RETRYABLE_STATUSES.has(error.status)) throw lastError
      }
    }

    throw lastError
  }

  return {
    /**
     * Sends a power signal to a server. The panel answers `204 No Content`.
     *
     * @param {string} serverId Server identifier or UUID.
     * @param {string} signal One of `start`, `stop`, `restart` or `kill`.
     * @returns {Promise<void>} Resolves once the panel accepted the signal.
     */
    async sendPowerSignal(serverId, signal) {
      await request(`/api/client/servers/${serverId}/power`, {
        method: 'POST',
        body: JSON.stringify({ signal })
      })
    },

    /**
     * Reads the current power state of a server.
     *
     * @param {string} serverId Server identifier or UUID.
     * @returns {Promise<string>} The state, e.g. `running` or `starting`.
     */
    async getServerState(serverId) {
      const response = await request(
        `/api/client/servers/${serverId}/resources`
      )
      const body = await response.json()

      return body?.attributes?.current_state ?? 'unknown'
    }
  }
}

/** An error carrying the HTTP status the panel replied with. */
class PterodactylApiError extends Error {
  /**
   * @param {string} message Human readable description.
   * @param {number} status The HTTP status code.
   */
  constructor(message, status) {
    super(message)
    this.name = 'PterodactylApiError'
    this.status = status
  }
}

/**
 * Turns an error response into a message worth putting in a workflow log.
 *
 * Pterodactyl reports failures as `{ errors: [{ code, status, detail }] }`.
 *
 * @param {Response} response The failed response.
 * @returns {Promise<string>} A human readable description.
 */
async function describeErrorResponse(response) {
  const prefix =
    `Pterodactyl API responded with ${response.status} ${response.statusText}`.trimEnd()
  const hint = HINTS_BY_STATUS[response.status]
  const detail = await readErrorDetail(response)

  return [prefix, detail, hint]
    .filter(Boolean)
    .map((part) => part.replace(/\.+$/, ''))
    .join('. ')
}

const HINTS_BY_STATUS = {
  401: 'Check that "bearer-token" is a client API key (ptlc_...) created under Account → API Credentials',
  403: 'Client API keys start with "ptlc_"; an application key (ptla_) will not work here. Otherwise the account lacks the Control permission on this server',
  404: 'Check "server-id" and that the key belongs to an account with access to it',
  429: 'The panel is rate limiting this API key'
}

/**
 * @param {Response} response The failed response.
 * @returns {Promise<string>} The panel's own error details, if it sent any.
 */
async function readErrorDetail(response) {
  const body = await response.text().catch(() => '')

  try {
    const errors = JSON.parse(body).errors

    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((error) => error.detail || error.code)
        .filter(Boolean)
        .join('; ')
    }
  } catch {
    // Not JSON (a proxy error page, for instance) — fall through to the body.
  }

  return body.trim().slice(0, 500)
}

/**
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>} Resolves once the delay elapsed.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
