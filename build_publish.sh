#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./build_publish.sh build
  ./build_publish.sh publish [npm-publish-args...]
  ./build_publish.sh dry-run [npm-publish-args...]

Commands:
  build    Install dependencies and build dist. This is the default.
  publish  Build, then publish to npm.
  dry-run  Build, then run npm publish --dry-run.

Environment:
  NPM_TOKEN     Optional npm automation token. If set, the script writes a
                temporary .npmrc and does not print the token.
  NPM_REGISTRY  Optional npm registry URL. Default: https://registry.npmjs.org/

Examples:
  ./build_publish.sh
  NPM_TOKEN=npm_xxx ./build_publish.sh publish
  ./build_publish.sh publish --otp 123456
  ./build_publish.sh dry-run
EOF
}

mode="${1:-build}"
case "$mode" in
  build|publish|dry-run)
    if [[ $# -gt 0 ]]; then
      shift
    fi
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown command: $mode" >&2
    usage >&2
    exit 2
    ;;
esac

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
npmrc_file=""

cleanup() {
  if [[ -n "$npmrc_file" && -f "$npmrc_file" ]]; then
    rm -f "$npmrc_file"
  fi
}
trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

require_cmd node
require_cmd npm

echo "==> Repository: $repo_dir"
echo "==> Node: $(node --version)"
echo "==> npm: $(npm --version)"

node - <<'JS'
const major = Number(process.versions.node.split('.')[0])
if (major < 18) {
  console.error('Node.js 18+ is required.')
  process.exit(2)
}
JS

cd "$repo_dir"

if [[ -n "${NPM_TOKEN:-}" ]]; then
  registry="${NPM_REGISTRY:-https://registry.npmjs.org/}"
  registry_host="${registry#https://}"
  registry_host="${registry_host#http://}"
  registry_host="${registry_host%/}"
  npmrc_file="$(mktemp /tmp/somark-js-npmrc.XXXXXX)"
  {
    echo "registry=$registry"
    echo "//$registry_host/:_authToken=$NPM_TOKEN"
  } > "$npmrc_file"
  export NPM_CONFIG_USERCONFIG="$npmrc_file"
  echo "==> Using npm token from NPM_TOKEN for $registry_host"
fi

echo "==> Installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Building package"
npm run build

if [[ "$mode" == "build" ]]; then
  echo "==> Build complete. Publish with: ./build_publish.sh publish"
  exit 0
fi

if [[ "$mode" == "dry-run" ]]; then
  echo "==> Running npm publish dry-run"
  npm publish --access public --dry-run "$@"
else
  echo "==> Publishing to npm"
  if [[ -z "${NPM_TOKEN:-}" ]]; then
    npm whoami >/dev/null
  fi
  npm publish --access public "$@"
fi

echo "==> Publish command complete"
