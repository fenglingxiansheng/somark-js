# Release Gate

Run this checklist before cutting a JavaScript SDK release, and verify the
matching Python repository with its own `docs/release_gate.md` in the same
release window.

## Repository Hygiene

- Generated package artifacts are local build outputs and should not be
  committed.
- Node dependencies, build output, coverage output, TypeScript build metadata,
  local env files, and package tarballs are covered by `.gitignore`.
- Remove tracked generated artifacts with `git rm` only after confirming they
  are tracked. Do not delete unrelated untracked local files during release
  cleanup.
- Confirm the working tree only contains intentional release changes before
  handoff:

```bash
git status --short
git ls-files | grep -E '(dist/|coverage/|node_modules/)'
```

## Contract Parity

- Keep `docs/sdk_parity_contract.md` equivalent to the Python repository.
- Run the cross-language CLI parity check from the parent coordination
  workspace when it is available.
- Do not change parser, config, task, output, preview, or PDF behavior as part
  of release-gate cleanup.

## Required Checks

```bash
npm test
npm run build
PACK_TGZ="$(npm pack --silent)"
SMOKE_DIR="$(mktemp -d)"
npm --prefix "$SMOKE_DIR" install --ignore-scripts --package-lock=false "$PWD/$PACK_TGZ"
node -e "import('$SMOKE_DIR/node_modules/somark-js/dist/index.mjs').then((m) => { if (!m.SoMark) process.exit(1) })"
rm -rf "$SMOKE_DIR" "$PACK_TGZ"
```
