# ψ Hydra-IDE — Swarm-Native Agentic Code Studio

**Hydra-IDE** is a full-stack, swarm-native AI code studio: a **100-agent inference swarm**,
a **zero-dependency TypeScript engine** that runs the LFM2.5-230M GGUF model locally
(or bridges to a real `llama.cpp` server), an **agentic IDE back-end** with a REST +
WebSocket API, a **complete browser-based IDE** (editor, explorer, AI assistant,
diagnostics, live swarm dashboard), and a **VS Code bridge extension**.

Everything runs locally. No cloud. No API keys. No build toolchain — the server executes
TypeScript directly, and the web studio is dependency-free vanilla JS.

---

## Table of Contents

1. [Highlights](#highlights)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [The Web Studio](#the-web-studio)
5. [VS Code Extension](#vs-code-extension)
6. [REST API Reference](#rest-api-reference)
7. [WebSocket Protocol](#websocket-protocol)
8. [The Swarm](#the-swarm)
9. [The Engine & The Model](#the-engine--the-model)
10. [Benchmarking](#benchmarking)
11. [Testing](#testing)
12. [Configuration](#configuration)
13. [Project Structure](#project-structure)
14. [Performance](#performance)
15. [Troubleshooting](#troubleshooting)
16. [License](#license)

---

## Highlights

| | |
| --- | --- |
| 🐙 **100-agent swarm** | 4 specialized clusters (completion, analysis, resolution, refactor/tests) with per-task budgets, cooldowns, and a DAG task graph. |
| 🗳️ **Consensus completions** | 7 agents vote on every inline completion; weighted aggregation picks the best candidate and reports an agreement score. |
| 🧠 **Dual inference backend** | Auto-probes an external `llama.cpp` server; otherwise runs **NeuralSim** — a local simulator driven by the bundled GGUF model's real metadata (architecture, vocab, context length, quantization). |
| 🖥️ **Full web IDE** | Custom code editor with syntax highlighting for 5 languages, ghost-text completions, multi-tab explorer with create/rename/delete, symbol search, problems panel, assistant chat, refactor & test-synthesis tools, and a live swarm dashboard. |
| 🧩 **VS Code bridge** | Inline completions, "Ask the Swarm", file analysis, and live agent telemetry in your everyday editor. |
| 📊 **Observability built in** | Structured log ring buffer, per-agent latency stats, task traces, 1 Hz telemetry stream over WebSocket, and a stdlib-only Python load benchmark with p50/p90/p99. |
| 🚫 **Zero runtime dependencies** | The server uses only `node:*` builtins + `ws`. The web studio uses nothing at all. Tests use the built-in `node:test` runner. |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                             CLIENTS                                  │
│  ┌──────────────────────┐        ┌────────────────────────────┐      │
│  │  Web Studio (web/)   │        │  VS Code extension         │      │
│  │  editor · swarm view │        │  inline completions · chat │      │
│  └─────────┬────────────┘        └─────────────┬──────────────┘      │
└────────────┼────────────────────────────────────┼─────────────────────┘
             │  REST (fetch) + WebSocket          │  REST
             ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    hydra-router  (server/src/router.ts)              │
│  static hosting of web/dist · 20 REST endpoints · WebSocket hub      │
│  log ring buffer · CORS dev mode · JSON error handling               │
└─────────────────────────────┬────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│           HydraOrchestrator  (server/src/services/hydra.ts)          │
│  routes each request to a cluster · records traces · counts metrics  │
├──────────────────────────────────────────────────────────────────────┤
│  services/                                                           │
│   ├─ workspace.ts   sandboxed in-memory workspace (seeded project)   │
│   └─ modelinfo.ts   GGUF header parser (arch, vocab, ctx, quant)     │
├──────────────────────────────────────────────────────────────────────┤
│  swarm/                                                              │
│   ├─ clusters.ts    Alpha·Beta·Gamma·Delta + agent pools             │
│   ├─ agent.ts       agent state machine (idle→working→cooling)       │
│   ├─ dispatcher.ts  budget-aware dispatch + cooldown + queue         │
│   ├─ consensus.ts   weighted vote aggregation (agreement metric)     │
│   └─ taskgraph.ts   DAG of task traces                               │
├──────────────────────────────────────────────────────────────────────┤
│  engine/                                                             │
│   ├─ llamacpp.ts    backend selection: llama-server ⇄ NeuralSim      │
│   ├─ neuralsim*.ts  complete·analyze·resolve·refactor·tests·chat     │
│   ├─ tokenizer.ts   Unicode-aware tokenizer + n-gram transitions     │
│   ├─ embeddings.ts  deterministic hash embeddings + cosine sim       │
│   ├─ chunker.ts     token-budget context chunking                    │
│   └─ knowledge.ts   workspace symbol index (defs, refs, snippets)    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

**Requirements:** Node.js **≥ 22.6** (native TypeScript type stripping; tested on Node 26).
Optional: Python 3.10+ for the benchmark tool, VS Code for the extension.

```bash
# 1. install (server deps only — the web studio has none)
npm install

# 2. start the full stack (router + swarm + web studio)
npm run dev          # dev mode: CORS enabled, verbose logging
npm start            # normal mode

# 3. open the IDE
#    → http://127.0.0.1:8214
```

That's it. The router seeds an in-memory sample workspace, spawns 100 agents across
4 clusters, and serves the web studio from `web/dist`.

<!-- __PART3__ -->

