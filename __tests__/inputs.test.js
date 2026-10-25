/**
 * Unit tests for src/inputs.js
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { readInputs } = await import('../src/inputs.js')

/**
 * Drives the `core.getInput` mock from a plain object of inputs.
 *
 * @param {Record<string, string>} inputs Values keyed by input name.
 * @returns {void}
 */
function givenInputs(inputs) {
  core.getInput.mockImplementation((name) => inputs[name] ?? '')
}

const VALID_INPUTS = {
  'panel-url': 'https://panel.example.com',
  'bearer-token': 'ptlc_token',
  'server-id': 'd3aac109',
  action: 'start'
}

describe('inputs.js', () => {
  it('reads every input', () => {
    givenInputs(VALID_INPUTS)

    expect(readInputs()).toEqual({
      panelUrl: 'https://panel.example.com',
      bearerToken: 'ptlc_token',
      serverId: 'd3aac109',
      signal: 'start'
    })
  })

  it('defaults to restart when no action is given', () => {
    givenInputs({ ...VALID_INPUTS, action: '' })

    expect(readInputs().signal).toBe('restart')
  })

  it('strips a trailing slash but keeps a sub path', () => {
    givenInputs({ ...VALID_INPUTS, 'panel-url': 'https://example.com/panel/' })

    expect(readInputs().panelUrl).toBe('https://example.com/panel')
  })

  it('rejects a malformed panel URL', () => {
    givenInputs({ ...VALID_INPUTS, 'panel-url': 'panel.example.com' })

    expect(() => readInputs()).toThrow(/"panel-url" is not a valid URL/)
  })

  it('rejects a non-http panel URL', () => {
    givenInputs({ ...VALID_INPUTS, 'panel-url': 'ftp://panel.example.com' })

    expect(() => readInputs()).toThrow(/must use http or https/)
  })

  it('rejects a blank bearer token', () => {
    givenInputs({ ...VALID_INPUTS, 'bearer-token': '   ' })

    expect(() => readInputs()).toThrow(/"bearer-token" must not be empty/)
  })

  it('rejects a server id that could escape the API path', () => {
    givenInputs({ ...VALID_INPUTS, 'server-id': 'd3aac109/../../nodes' })

    expect(() => readInputs()).toThrow(/"server-id" must be a Pterodactyl/)
  })
})
