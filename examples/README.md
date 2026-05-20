# somark-js Examples

Standalone TypeScript scripts demonstrating key SDK capabilities.

## Prerequisites

```bash
# From the repo root
npm install

# API key (one of):
export SOMARK_API_KEY=sk-...
# or: somark login
```

## Running Examples

Each example is self-contained and runnable via `npx tsx`:

```bash
cd somark-js

# 01 — Basic sync parse: PDF → markdown
npx tsx examples/01_basic_parse.ts

# 02 — Multi-format: PDF → md + json in one call
npx tsx examples/02_multi_format.ts

# 03 — Async task: submit → poll → get result
npx tsx examples/03_async_task.ts

# 07 — PDF to images (local, no API key needed)
npx tsx examples/07_pdf_to_images.ts

# 08 — Error handling: parse image + catch specific error types
npx tsx examples/08_error_handling.ts

# 09 — End-to-end pipeline: parse image → save Markdown → preview server
npx tsx examples/09_pipeline.ts
```

Or add to `package.json` scripts:

```json
{
  "scripts": {
    "example:01": "tsx examples/01_basic_parse.ts",
    "example:02": "tsx examples/02_multi_format.ts",
    "example:03": "tsx examples/03_async_task.ts",
    "example:07": "tsx examples/07_pdf_to_images.ts",
    "example:08": "tsx examples/08_error_handling.ts",
    "example:09": "tsx examples/09_pipeline.ts"
  }
}
```

## Scenarios

| File | Scenario | SDK Feature |
|------|----------|-------------|
| `01_basic_parse.ts` | Basic sync parse | `parser.parse()` |
| `02_multi_format.ts` | Multi-format export | `parser.parse()` with `formats` + `elementFormats` |
| `03_async_task.ts` | Async task + wait | `parser.create()` + `task.wait()` |
| `07_pdf_to_images.ts` | PDF → images (local) | `pdf.toImages()` |
| `08_error_handling.ts` | Error handling | All error types |
| `09_pipeline.ts` | End-to-end pipeline | parse → save Markdown → preview |

## Data Files

```
examples/data/
├── 2010.02399v1.pdf                  — English research paper
├── 5115_Attention_Guided_Alignmen.pdf — English research paper
├── 研报1.png                          — Chinese financial report image
└── 中文试卷-page.png                   — Chinese exam paper image
```

## Notes

- Output files (`output_*.md`, `output_*.json`) are written to `examples/` and not tracked by git.
- Example 07 uses the PDF dependency included with `somark-js`.
- Example 09 preview server requires the `vendor/somarkdown-viewer` submodule.
- API key is read from `SOMARK_API_KEY` env var or `~/.somark/config.toml` — never hardcoded.
