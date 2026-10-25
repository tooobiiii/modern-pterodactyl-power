/**
 * Unit tests for the action's main functionality, src/main.js
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as pterodactyl from '../__fixtures__/pterodactyl.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/pterodactyl.js', () => pterodactyl)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

const INPUTS = {
  'panel-url': 'https://panel.example.com',
  'bearer-token': 'ptlc_token',
  'server-id': 'd3aac109',
  action: 'restart'
}

describe('main.js', () => {
  beforeEach(() => {
    core.getInput.mockImplementation((name) => INPUTS[name] ?? '')
    pterodactyl.createPterodactylClient.mockReturnValue(pterodactyl)
    pterodactyl.sendPowerSignal.mockResolvedValue(undefined)
    pterodactyl.getServerState.mockResolvedValue('starting')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('sends the requested signal and sets the outputs', async () => {
    await run()

    expect(pterodactyl.createPterodactylClient).toHaveBeenCalledWith({
      panelUrl: 'https://panel.example.com',
      bearerToken: 'ptlc_token'
    })
    expect(pterodactyl.sendPowerSignal).toHaveBeenCalledWith(
      'd3aac109',
      'restart'
    )
    expect(core.setOutput).toHaveBeenCalledWith('signal', 'restart')
    expect(core.setOutput).toHaveBeenCalledWith('state', 'starting')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('masks the API key', async () => {
    await run()

    expect(core.setSecret).toHaveBeenCalledWith('ptlc_token')
  })

  it('warns but succeeds when the state cannot be read', async () => {
    pterodactyl.getServerState.mockRejectedValue(new Error('panel timed out'))

    await run()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('panel timed out')
    )
    expect(core.setOutput).toHaveBeenCalledWith('state', '')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('fails the workflow when an input is invalid', async () => {
    core.getInput.mockImplementation((name) =>
      name === 'action' ? 'reboot' : INPUTS[name]
    )

    await run()

    expect(pterodactyl.sendPowerSignal).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported power action "reboot"')
    )
  })

  it('fails the workflow when the panel rejects the signal', async () => {
    pterodactyl.sendPowerSignal.mockRejectedValue(
      new Error('Pterodactyl API responded with 404 Not Found')
    )

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Pterodactyl API responded with 404 Not Found'
    )
  })
})
