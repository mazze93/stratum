# @stratum-ledger/cli

`stratum` is the command-line client for [Stratum](https://stratum.mazzeleczzare.com),
an epistemic decision ledger. One command records one decision. Decisions stay
*narrative* until their evidence is checked; `stratum verify --run` runs the check
and binds its result to the exact commit.

Zero dependencies. Node 20+.

## Install

```sh
npm install -g @stratum-ledger/cli
# or
brew install mazze93/tap/stratum
```

## Verify what you installed

The package is published only from this repository's release workflow, with npm
provenance (a Sigstore-signed statement that links it to the source commit and
the workflow run):

```sh
npm audit signatures
```

Each GitHub Release also carries a SHA-256 checksum, a cosign keyless signature,
and a build-provenance attestation for the release bundle. The layers and the
commands to verify each one are in
[SECURITY.md](https://github.com/mazze93/stratum/blob/main/SECURITY.md#provenance--signed-stamped-verifiable).

## Use

```sh
stratum init --endpoint https://your-instance --token <token> --log workspace
stratum decide "Pin actions by SHA" --pending     # record a decision
stratum verify dec-xxxx --run "npm test"          # run the check, bind it to the commit
stratum foreclose "Mutable action tags"           # record the road not taken
stratum tessera                                   # the ledger as it stands
stratum help                                      # every command
```

There is no default log: name one with `--log`, `STRATUM_LOG`, or `stratum init`.

Exit codes:

- 0: ok
- 1: error
- 2: guard refused (contract violation)
- 3: unrecorded, queued in the outbox
- 4: ratification needs a human at a terminal

A server is required. Run your own from the repository (Cloudflare Workers),
or try the public playground with `stratum playground`.

## Links

- Source, contract and decision record: <https://github.com/mazze93/stratum>
- Changelog: <https://github.com/mazze93/stratum/blob/main/CHANGELOG.md>
- Wire API for automated writers (`stratum emit`): <https://github.com/mazze93/stratum/blob/main/docs/API.md>

MIT licensed.
