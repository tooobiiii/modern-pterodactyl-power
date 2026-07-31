# Modern Pterodactyl Power

[![GitHub Super-Linter](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/linter.yml/badge.svg)](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/linter.yml)
[![CI](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/ci.yml/badge.svg)](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/ci.yml)
[![Check dist/](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/check-dist.yml/badge.svg)](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/tooobiiii/modern-pterodactyl-power/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that sends a power signal — `start`, `stop`, `restart` or `kill`
— to a server on a [Pterodactyl](https://pterodactyl.io) panel. Useful for
restarting a game or bot server after a deployment.

It targets the
[client API power endpoint](https://pterodactyl-api-docs.netvpx.com/docs/api/client/servers#power-management),
`POST /api/client/servers/{server}/power`, and runs on `node24` with no runtime
dependencies beyond `@actions/core`.

## Usage

```yaml
steps:
  - name: Restart the server
    id: power
    uses: tooobiiii/modern-pterodactyl-power@v1
    with:
      panel-url: https://panel.example.com
      bearer-token: ${{ secrets.PTERODACTYL_TOKEN }}
      server-id: d3aac109
      action: restart

  - name: Print the resulting state
    run: echo "${{ steps.power.outputs.state }}"
```

### Inputs

| Input          | Required | Default   | Description                                                                                           |
| -------------- | -------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `panel-url`    | yes      |           | The URL of your panel, e.g. `https://panel.example.com`. A sub path is kept, a trailing slash is not. |
| `bearer-token` | yes      |           | A **client** API key (`ptlc_...`), created under _Account → API Credentials_. Store it as a secret.   |
| `server-id`    | yes      |           | The server identifier shown in the panel URL (`d3aac109`) or the full server UUID.                    |
| `action`       | no       | `restart` | The power signal to send: `start`, `stop`, `restart` or `kill`. Case insensitive.                     |

> [!IMPORTANT]
>
> Use a **client** API key (`ptlc_`), not an application key (`ptla_`). The
> account owning the key needs the _Control_ permission on the server.

### Outputs

| Output   | Description                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `signal` | The normalized signal that was sent.                                                                                            |
| `state`  | The power state the panel reported right after the signal was delivered, e.g. `starting`. Empty if the state could not be read. |

Power signals are asynchronous: the panel answers `204 No Content` as soon as it
accepts the signal, so `state` is typically `starting` or `stopping` rather than
the final state. The action does not wait for the server to settle.

### Behavior on failure

- Invalid inputs fail the step before any request is made.
- API errors fail the step with the panel's own `detail` message, plus a hint
  for the common `401`, `403`, `404` and `429` cases.
- Rate limits (`429`), server errors (`5xx`) and network failures are retried
  twice with exponential backoff. A retry can re-deliver a signal if the panel
  accepted it but the response was lost — harmless for `start` and `stop`, worth
  knowing for `restart`.
- Failing to read the state afterwards is a warning, not a failure: the signal
  was already delivered.
