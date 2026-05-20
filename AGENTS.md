# somark-js Agent Guide

## Project Boundary

This repository contains the JavaScript/TypeScript implementation of the SoMark SDK and `somark` CLI. It is developed in parallel with the Python implementation, but it is its own package and release unit.

Keep behavior aligned with `somark-py` wherever the public CLI or SDK capability is intended to be shared. Language-specific naming is fine; surprise behavior is not.

When work is initiated from the parent `somark-cli` workspace, always consider the matching `somark-py` repository before finishing. Public CLI and SDK behavior changes usually require synchronized changes in both repositories. If no Python change is needed, verify that explicitly rather than assuming it.

## What Must Stay Aligned

- Parse endpoints: `/parse/sync`, `/parse/async`, `/parse/async_check`
- Usage endpoint: `/usage`
- Parse request fields: `output_formats`, `element_formats`, `feature_config`
- CLI command shape, exit codes, and local-tool behavior
- Error categories exposed to users

## Useful Commands

```bash
npm test
npm run build
node dist/cli.js --help
node dist/cli.js parse --help
```

After changes, run the relevant JavaScript tests in this repository and commit the JavaScript changes here separately from any `somark-py` commit.

## Maintenance Rules

- Keep README short. Product usage belongs in the official docs at `https://docs.somark.tech/documentation`.
- Do not duplicate long API tables in README or agent files.
- Public timeout values are in seconds; convert internally only where the runtime API needs milliseconds.
- Local PDF and preview features must not require an API key.
- Remote parse and usage features must fail clearly when the API key is missing.
- Prefer explicit validation errors over silently dropping unsupported parameters.
