# context-compression-engine

[![CI](https://github.com/SimplyLiz/ContextCompressionEngine/actions/workflows/ci.yml/badge.svg)](https://github.com/SimplyLiz/ContextCompressionEngine/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/context-compression-engine.svg)](https://www.npmjs.com/package/context-compression-engine)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

Lossless context compression for LLMs. Zero dependencies. Zero API calls. Works everywhere JavaScript runs.

> **1.3-6.1x compression** on synthetic scenarios, **1.5x on real Claude Code sessions** (11.7M chars across 8,004 messages) — fully deterministic, no LLM needed. Largest session: 4,257 messages / 5.8M chars compressed in 651ms with zero negatives. Every compression is losslessly reversible.

## The problem

Context is the RAM of LLMs. As conversations grow, model attention spreads thin — a phenomenon known as **context rot**. Tokens spent on stale prose are tokens not spent on the task at hand.

Most solutions throw an LLM at the problem: summarize old messages, hope the summary is shorter, pay for the API call, wait for the response. That works sometimes. But it's slow, expensive, and — as our benchmarks show — **often produces worse compression than a well-designed deterministic engine.**

## What this does

`context-compression-engine` compresses LLM message arrays by summarizing prose while preserving code, structured data, and technical content verbatim. Every compression is fully reversible — `uncompress` restores byte-identical originals.

```ts
import { compress, uncompress } from 'context-compression-engine';

const { messages: compressed, verbatim } = compress(messages, {
  preserve: ['system'],
  recencyWindow: 4,
});

// later — restore originals
const { messages: originals } = uncompress(compressed, verbatim);
```

No API keys. No network calls. Runs synchronously by default. Under 2ms for typical conversations.

## Key findings

The deterministic engine achieves **1.3-6.1x compression with zero latency and zero cost.** It scores sentences, packs a budget, strips filler — and in most scenarios, it compresses tighter than an LLM. LLM summarization is opt-in for cases where semantic understanding improves quality. See [Benchmarks](docs/benchmarks.md) for the full comparison.

## Features

- **Lossless round-trip** — `compress` then `uncompress` restores byte-identical originals
- **Code-aware** — fences, SQL, JSON, API keys, URLs, and file paths stay verbatim
- **Deduplication** — exact and fuzzy duplicate detection eliminates repeated content
- **LLM-powered** — plug in any summarizer (Claude, GPT, Gemini, Grok, Ollama) for semantic compression
- **Three-level fallback** — LLM → deterministic → size guard, never makes output worse
- **Budget-driven** — `tokenBudget` binary-searches `recencyWindow` to fit a target token count
- **Pluggable token counter** — bring your own tokenizer for accurate budget decisions
- **Provenance tracking** — every compressed message carries origin IDs, summary hashes, and version chains
- **Zero dependencies** — pure TypeScript, no crypto, no network calls
- **333 tests** — comprehensive coverage across all compression paths

## Install

```bash
npm install context-compression-engine
```

Works in Node 18+, Deno, Bun, and edge runtimes. This is an ESM-only package — `require()` is not supported.

## Quick Start

```ts
import { compress, uncompress } from 'context-compression-engine';

// compress — prose gets summarized, code stays verbatim
const {
  messages: compressed,
  verbatim,
  compression,
} = compress(messages, {
  preserve: ['system'], // roles to never compress
  recencyWindow: 4, // protect the last N messages
});

// uncompress — restore originals from the verbatim store
const { messages: originals } = uncompress(compressed, verbatim);
```

**Important:** `messages` and `verbatim` must be persisted together atomically. Writing compressed messages without their verbatim originals causes irrecoverable data loss. See [Round-trip](docs/round-trip.md) for details.

## Documentation

| Page                                                 | Description                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| [API Reference](docs/api-reference.md)               | All exports, types, options, and result fields                  |
| [Compression Pipeline](docs/compression-pipeline.md) | How compression works: classify, dedup, merge, summarize, guard |
| [Deduplication](docs/deduplication.md)               | Exact + fuzzy dedup algorithms, tuning thresholds               |
| [Token Budget](docs/token-budget.md)                 | Budget-driven compression, binary search, custom tokenizers     |
| [LLM Integration](docs/llm-integration.md)           | Provider examples: Claude, OpenAI, Gemini, Grok, Ollama         |
| [Round-trip](docs/round-trip.md)                     | Lossless compress/uncompress, VerbatimMap, atomicity            |
| [Provenance](docs/provenance.md)                     | `_cce_original` metadata, summary_id, parent_ids                |
| [Preservation Rules](docs/preservation-rules.md)     | What gets preserved, classification tiers, code-aware splitting |
| [Benchmarks](docs/benchmarks.md)                     | Running benchmarks, LLM comparison, interpreting results        |

## API overview

### `compress(messages, options?)`

Deterministic compression. Returns a `Promise` when a `summarizer` is provided.

```ts
const result = compress(messages, { preserve: ['system'], recencyWindow: 4 });
result.messages; // compressed messages
result.verbatim; // originals keyed by ID
result.compression.ratio; // character compression ratio (>1 = savings)
result.compression.token_ratio; // token compression ratio
```

Full options: [API Reference](docs/api-reference.md#compressoptions)

### `uncompress(messages, store, options?)`

Restore originals. Accepts a `VerbatimMap` or a `(id) => Message` lookup function.

```ts
const { messages, missing_ids } = uncompress(compressed, verbatim);
```

### `createSummarizer(callLlm, options?)`

Create an LLM-powered summarizer with an optimized prompt template.

```ts
const summarizer = createSummarizer(async (prompt) => myLlm.complete(prompt));
const result = await compress(messages, { summarizer });
```

### `createEscalatingSummarizer(callLlm, options?)`

Three-level escalation: normal → aggressive → deterministic fallback.

### `defaultTokenCounter(msg)`

Built-in estimator: `ceil(content.length / 3.5)`. Replace with a real tokenizer for accurate budgets.

## License

This project is dual-licensed:

- **Open source** — [AGPL-3.0](LICENSE). You can use, modify, and distribute this library freely, provided your project is also open-sourced under AGPL-3.0 or a compatible license.
- **Commercial** — If you want to use this library in proprietary software without open-sourcing your project, a commercial license is available. Contact [lisa@tastehub.io](mailto:lisa@tastehub.io) for terms.
