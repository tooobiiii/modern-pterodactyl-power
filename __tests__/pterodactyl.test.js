/**
 * Unit tests for src/pterodactyl.js
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { createPterodactylClient } = await import('../src/pterodactyl.js')

/**
 * Builds a minimal stand-in for a `fetch` Response.
 *
 * @param {object} options Response options.
 * @param {number} [options.status] HTTP status code.
 * @param {string} [options.statusText] HTTP status text.
 * @param {string} [options.body] Raw response body.
 * @param {unknown} [options.json] Body to serialize as JSON.
 * @returns {object} The fake response.
 */
function response({ status = 204, statusText = '', body = '', json }) {
  const text = json === undefined ? body : JSON.stringify(json)

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => text,
    json: async () => JSON.parse(text)
  }
}

/**
 * @param {object} [overrides] Client options to override.
 * @param {typeof fetch} [fetchImpl] The fetch stub to use.
 * @returns {object} A client wired to the stub.
 */
function createClient(fetchImpl, overrides = {}) {
  return createPterodactylClient({
    panelUrl: 'https://panel.example.com',
    bearerToken: 'ptlc_token',
    fetchImpl,
    sleepImpl: jest.fn().mockResolvedValue(undefined),
    retryDelayMs: 0,
    ...overrides
  })
}

describe('pterodactyl.js', () => {
  describe('sendPowerSignal', () => {
    it('posts the signal to the power endpoint', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(response({ status: 204 }))

      await createClient(fetchImpl).sendPowerSignal('d3aac109', 'restart')

      expect(fetchImpl).toHaveBeenCalledTimes(1)

      const [url, init] = fetchImpl.mock.calls[0]

      expect(url).toBe(
        'https://panel.example.com/api/client/servers/d3aac109/power'
      )
      expect(init.method).toBe('POST')
      expect(init.body).toBe('{"signal":"restart"}')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer ptlc_token',
        Accept: 'application/vnd.pterodactyl.v1+json',
        'Content-Type': 'application/json'
      })
    })

    it('surfaces the panel error detail and does not retry client errors', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(
        response({
          status: 400,
          statusText: 'Bad Request',
          json: {
            errors: [
              {
                code: 'HttpException',
                detail: 'Server is not currently running.'
              }
            ]
          }
        })
      )

      await expect(
        createClient(fetchImpl).sendPowerSignal('d3aac109', 'stop')
      ).rejects.toThrow('Server is not currently running')

      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('does not double up the punctuation between message parts', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(
        response({
          status: 403,
          statusText: 'Forbidden',
          json: {
            errors: [
              {
                code: 'HttpException',
                // The panel punctuates its own details.
                detail: 'You are attempting to use an application API key.'
              }
            ]
          }
        })
      )

      await expect(
        createClient(fetchImpl).sendPowerSignal('d3aac109', 'restart')
      ).rejects.toThrow(/application API key\. Client API keys/)
    })

    it('adds a hint when the API key is rejected', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(
          response({ status: 401, statusText: 'Unauthorized' })
        )

      await expect(
        createClient(fetchImpl).sendPowerSignal('d3aac109', 'start')
      ).rejects.toThrow(/client API key \(ptlc_\.\.\.\)/)
    })

    it('retries transient failures', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(
          response({ status: 503, statusText: 'Unavailable' })
        )
        .mockResolvedValueOnce(response({ status: 204 }))

      await createClient(fetchImpl).sendPowerSignal('d3aac109', 'start')

      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('retries network failures and gives up after the last attempt', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNRESET'))

      await expect(
        createClient(fetchImpl).sendPowerSignal('d3aac109', 'kill')
      ).rejects.toThrow(/failed: ECONNRESET/)

      // One initial attempt plus the two default retries.
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    })
  })

  describe('getServerState', () => {
    it('returns the current state', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(
        response({
          status: 200,
          json: { attributes: { current_state: 'running' } }
        })
      )

      await expect(
        createClient(fetchImpl).getServerState('d3aac109')
      ).resolves.toBe('running')
      expect(fetchImpl.mock.calls[0][0]).toBe(
        'https://panel.example.com/api/client/servers/d3aac109/resources'
      )
    })

    it('falls back to "unknown" when the payload has no state', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(response({ status: 200, json: {} }))

      await expect(
        createClient(fetchImpl).getServerState('d3aac109')
      ).resolves.toBe('unknown')
    })
  })
})
