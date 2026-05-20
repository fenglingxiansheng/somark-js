# somark-js

[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/somark-js)](https://www.npmjs.com/package/somark-js)

The official JavaScript/TypeScript SDK and CLI for [SoMark](https://somark.ai).

This repository is the JavaScript/TypeScript implementation of the shared SoMark SDK + CLI contract. The Python implementation lives in [`somark-py`](https://github.com/SoMarkAI/somark-py). Same product, different runtime.

## Install

```bash
npm install somark-js
```

## Documentation

Read the official documentation at [docs.somark.tech/documentation](https://docs.somark.tech/open-source-tools).

The docs cover authentication, CLI usage, SDK examples, async tasks, local preview, PDF utilities, API parameters, and error handling. This README stays intentionally short so it does not become a second, worse documentation site.

## Requirements

- Node.js 18+
- A SoMark API key for remote parsing and usage queries
- No API key required for local PDF utilities or SoMarkDown preview
- Docker/Ubuntu Python PDF rendering may require system libraries: `apt-get install -y --no-install-recommends libxcb1 libgl1 libglib2.0-0`

## License

Apache-2.0
