import * as core from '@actions/core'
import { readInputs } from './inputs.js'
import { createPterodactylClient } from './pterodactyl.js'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const { panelUrl, bearerToken, serverId, signal } = readInputs()

    // Keep the key out of the logs, even if a later error echoes it back.
    core.setSecret(bearerToken)

    const client = createPterodactylClient({ panelUrl, bearerToken })

    core.info(`Sending "${signal}" to server ${serverId} on ${panelUrl}...`)
    await client.sendPowerSignal(serverId, signal)
    core.info('The panel accepted the power signal.')

    const state = await readServerState(client, serverId)

    core.setOutput('signal', signal)
    core.setOutput('state', state)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

/**
 * Reads the resulting server state. The power signal has already been
 * delivered at this point, so a failure here is reported but not fatal.
 *
 * @param {import('./pterodactyl.js').PterodactylClient} client The API client.
 * @param {string} serverId Server identifier or UUID.
 * @returns {Promise<string>} The state, or an empty string if it is unknown.
 */
async function readServerState(client, serverId) {
  try {
    const state = await client.getServerState(serverId)
    core.info(`Server ${serverId} is now "${state}".`)

    return state
  } catch (error) {
    core.warning(`Could not read the server state: ${error.message}`)

    return ''
  }
}
