<div align="center">

# 🐍 HYDRA-IDE

### *Swarm-Native AI Code Studio — 100 local agents, one consensus*

**Zero cloud · Zero API keys · Zero npm runtime dependencies · Fully offline**

![Node](https://img.shields.io/badge/node-%E2%89%A522.6-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Agents](https://img.shields.io/badge/swarm-100%20agents-00e5a0)
![Latency](https://img.shields.io/badge/completion-p50%20%E2%89%8839ms-37b6ff)
![Tests](https://img.shields.io/badge/tests-10%2F10%20pass-8fce00)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

</div>

---

Hydra-IDE is a **complete, self-contained AI development environment** that runs
entirely on your machine. A TypeScript **swarm router** orchestrates **100 agent
nodes** across four specialised clusters, routing every editor action — inline
completions, static analysis, symbol resolution, refactoring, test synthesis,
and assistant chat — through a **weighted-voting consensus pipeline**. It ships
with a **built-in web studio** (a full IDE in the browser), a **VS Code
extension**, a **local GGUF model engine** with a deterministic NeuralSim
fallback, and a **load benchmark** — all in one repository, with **no runtime
npm dependencies**.

> **The headline numbers** (measured, this repo, dev laptop):
> inline completion through the full 7-voter consensus: **p50 ≈ 39 ms · p90 ≈ 59 ms · 48.9 req/s** · 0 errors over 40+200 run batches.

---

## 📑 Table of Contents

1. [Why Hydra?](#-why-hydra)
2. [Architecture](#️-architecture)
3. [Anatomy of a Completion](#-anatomy-of-a-completion-request)
4. [Quick Start](#-quick-start)
5. [Configuration](#-configuration-cli--env)
6. [The Web Studio](#-the-web-studio)
7. [The Swarm](#-the-swarm)
8. [The Intelligence Engine](#-the-intelligence-engine)
9. [REST API Reference](#-rest-api-reference)
10. [WebSocket Protocol](#-websocket-protocol)
11. [VS Code Extension](#-vs-code-extension)
12. [Benchmarking](#-benchmarking)
13. [Testing](#-testing)
14. [Project Structure](#-project-structure)
15. [Performance](#-performance)
16. [Security & Privacy](#-security--privacy)
17. [Troubleshooting](#-troubleshooting)
18. [Roadmap](#-roadmap)
19. [License](#-license)

## 🧠 Why Hydra?

Most "AI IDEs" are thin clients around a cloud LLM. Hydra-IDE inverts that:
**the intelligence lives inside your editor's own backend**, run by a swarm you
can watch, tune, and benchmark.

| Principle | What it means here |
| --- | --- |
| **Swarm over singleton** | Every request is decomposed, fanned out to a cluster of agents, and resolved by weighted voting — no single point of opinion. |
| **Consensus you can see** | Vote counts, agent states, cluster backlogs and per-task latencies are streamed live over WebSocket and visualised in the Swarm dashboard. |
| **Offline by default** | NeuralSim — a deterministic, rule + n-gram + embedding engine — answers everything with **no model file, no GPU, no network**. Attach a GGUF via llama.cpp when you want generative text. |
| **Zero runtime deps** | The server runs on Node's native TypeScript stripping + a hand-rolled HTTP/WS layer. The web studio is vanilla ES modules. `npm install` is only for dev tooling. |
| **Honest intelligence** | When the deterministic engine can't answer, it *says so* and tells you exactly which skills it has — no hallucinated confidence. |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SURFACES                                 │
│  ┌───────────────────────┐   ┌──────────────────┐   ┌─────────────────────┐  │
│  │  Web Studio (vanilla) │   │  VS Code Bridge  │   │  REST / scripts     │  │
│  │  web/src · served at /│   │  extensions/     │   │  curl, benchmark.py │  │
│  └──────────┬────────────┘   └────────┬─────────┘   └──────────┬──────────┘  │
└─────────────┼─────────────────────────┼────────────────────────┼─────────────┘
              │ HTTP + WebSocket (/ws)  │ REST only              │ REST only
              ▼                         ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             HYDRA-ROUTER  (server/src)                       │
│                                                                              │
│  router.ts ── HTTP + static studio + REST routing                            │
│      │                                                                       │
│      ▼                                                                       │
│  HydraOrchestrator (services/hydra.ts) ── task routing, traces, counters     │
│      │                                                                       │
│      ▼                                                                       │
│  Dispatcher (swarm/dispatcher.ts) ── fan-out to clusters, per-agent budget   │
│      ├─ ALPHA (30) ─ inline completions ── 7 vote ──► consensus.ts           │
│      ├─ BETA  (25) ─ AST inspection / static analysis                        │
│      ├─ GAMMA (25) ─ symbol resolution across the workspace                  │
│      └─ DELTA (20) ─ refactoring · test synthesis · security review          │
│      │                                                                       │
│      ▼                                                                       │
│  TaskGraph (swarm/taskgraph.ts) ── DAG of tasks, dependencies, tracing       │
│                                                                              │
│  Workspace (services/workspace.ts) ── in-memory sandbox: tree, CRUD, symbols │
│  Engine (engine/engine.ts) ── backend selection + warm-up + stats            │
│      ├─ NeuralSim ── deterministic: tokenizer · hash embeddings · chunker    │
│      │               n-gram model · knowledge base · per-task simulators     │
│      └─ llama.cpp ── GGUF metadata (modelinfo.ts) + llama-server adapter     │
│                                                                              │
│  TelemetryHub (ws.ts) ── 250 ms broadcasts: agent grid, tasks, logs          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Component map**

| Layer | Files | Responsibility |
| --- | --- | --- |
| Entry | `server/src/index.ts` | CLI parsing, model probe, boot sequence |
| Transport | `router.ts`, `ws.ts` | HTTP/1.1 + WebSocket, static studio, JSON routing |
| Orchestration | `services/hydra.ts` | Routes each verb to the right cluster, builds traces |
| Swarm core | `swarm/agent.ts`, `clusters.ts`, `dispatcher.ts`, `taskgraph.ts` | Agent lifecycle (idle → working → cooling), cluster budgets, DAG execution |
| Consensus | `swarm/consensus.ts` | Merges weighted votes, ranks candidates, agreement metric |
| Intelligence | `engine/neuralsim*.ts` | Deterministic completions, analysis, resolve, refactor, tests, chat |
| Model | `services/modelinfo.ts`, `engine/llamacpp.ts` | GGUF binary parser (v2/v3), llama-server adapter |
| Workspace | `services/workspace.ts` | Virtual project: seed, tree, CRUD, symbol index |
| Web studio | `web/src/**` | Editor, explorer, panels, swarm dashboard, Markdown renderer |
| Extension | `extensions/vscode-hydra/` | VS Code inline completions + commands + status bar |

---

## 🔬 Anatomy of a Completion Request

What happens in those ~39 milliseconds when you pause typing:

```
keystroke pause (120 ms debounce)
  │
  ▼
POST /api/completions { filePath, lang, source, cursor, topK }
  │
  ▼
HydraOrchestrator.complete()
  ├─ pulls the workspace snapshot (every file's content)
  ├─ asks the Dispatcher to fan out to the ALPHA cluster
  │     7 agents work IN PARALLEL, each seeded differently:
  │       · tokenizer + hash-embedding similarity vs. workspace context
  │       · n-gram transition model over the current file
  │       · knowledge-base lookups (stdlib / idioms)
  │       → each produces ranked candidates with confidences  (Vote)
  │
  ▼
aggregateVotes(votes, topK)  ─ swarming/consensus
  ├─ merge candidates by normalised text
  ├─ score = Σ (vote weight × confidence × agent agreement)
  ├─ support = voters that backed each winner
  └─ rank → top-K final candidates
  │
  ▼
Response { candidates[], votes: 7, latencyMs, tokensPredicted, model }
  │
  ▼
Studio renders ghost text (best) + candidate panel (all K)
  Tab accepts · Esc dismisses · click picks an alternative
```

Every step above is observable: the response carries `votes` and `latencyMs`,
a `TaskTraceEntry` is appended, and the Swarm dashboard's task feed + agent
grid update within 250 ms via WebSocket.

---

## 🚀 Quick Start

**Prerequisites:** [Node.js ≥ 22.6](https://nodejs.org) (native TS stripping) —
that's it. Python 3 is optional (benchmark only). No GPU. No API keys. No
model download required.

```bash
# 1 · install dev tooling (workspace: server + web)
npm install

# 2 · start the swarm router + web studio
npm start

# 3 · open the studio
#    → http://127.0.0.1:8214
```

Other scripts:

```bash
npm run dev        # dev mode — CORS + verbose logs
npm test           # server unit tests (node:test, 10/10)
npm run bench      # 200-request load benchmark vs. the running router
npm run build      # typecheck the server + rebuild web/dist
npm run ext:install / npm run ext:package   # package the VS Code extension
```

> Model file: the repo ships `models/LFM2.5-230M-QAD-Q4_0.gguf` (142 MB,
> GGUF v3). Its metadata (architecture, context length, quantisation) is parsed
> and surfaced in the Output panel. With `HYDRAS_BACKEND=auto` (default) the
> deterministic NeuralSim engine powers all answers; the GGUF is used when you
> switch to `--backend llamacpp`.

---

## ⚙️ Configuration (CLI + ENV)

Every setting has three layers — **CLI flag → `HYDRAS_*` env var → default**.
Copy `.env.example` → `.env` for env-style setup (`.env` is gitignored).

| Flag | Env var | Default | Description |
| --- | --- | --- | --- |
| `--host` | `HYDRAS_HOST` | `127.0.0.1` | Bind address (keep loopback for local-only) |
| `--port` | `HYDRAS_PORT` | `8214` | HTTP + WebSocket port |
| `--agents` | `HYDRAS_AGENTS` | `100` | Total swarm workers (min 4) |
| `--voters` | `HYDRAS_VOTERS` | `7` | Voting agents per completion (1–60) |
| `--model` / `--model-path` | `HYDRAS_MODEL` | `./models/LFM2.5-230M-QAD-Q4_0.gguf` | Local GGUF path |
| `--backend` | `HYDRAS_BACKEND` | `auto` | `auto` \| `neuralsim` \| `llamacpp` |
| `--llama-server` | `HYDRAS_LLAMA_SERVER` | `http://127.0.0.1:8080` | External llama-server URL |
| `--workers` | `HYDRAS_WORKERS` | `4` | HTTP worker threads |
| `--context-tokens` | `HYDRAS_CONTEXT_TOKENS` | `4096` | Context chunking budget |
| `--completion-debounce` | `HYDRAS_COMPLETION_DEBOUNCE` | `120` | Keystroke debounce (ms) |
| `--telemetry-interval` | `HYDRAS_TELEMETRY_INTERVAL` | `250` | WS broadcast cadence (ms) |
| `--dev` | `HYDRAS_DEV=1` | off | CORS + verbose logs |
| `--no-seed` | `HYDRAS_NO_SEED=1` | off | Don't seed the sample workspace |
| `--log-level` | `HYDRAS_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `--help` | — | — | Print the full usage text |

Example — a 500-agent swarm with 15 voters on port 9000:

```bash
node server/src/index.ts --agents 500 --voters 15 --port 9000
```

---

## 🖥️ The Web Studio

Open **http://127.0.0.1:8214** — the router serves the built studio from
`web/dist` (rebuild with `npm run build -w web`; source lives in `web/src`).
The studio is **15 dependency-free files**: a hand-rolled editor with syntax
highlighting, a workspace explorer, a live swarm dashboard, and tool panels —
all talking to the same REST/WS API that your scripts use.

```
┌───────────────────────── top bar: backend · model · agents · uptime ───────┐
├────────────┬──────────────────────────────────────────┬────────────────────┤
│ EXPLORER   │  tabs                                    │  ASSISTANT         │
│ filter     │  ┌────────────────────────────────────┐  │   chat (Markdown)  │
│ file tree  │  │  code editor   gutter + ghost text │  │  PROBLEMS          │
│ (+/✎/×)    │  │  syntax-highlighted mirror         │  │   click → jump     │
│ SYMBOLS    │  │  swarm completion picker           │  │  REFACTOR / TESTS  │
│ search     │  └────────────────────────────────────┘  │   resolve · patch  │
├────────────┴──────────────────────────────────────────┴────────────────────┤
│ status bar: file · lang · dirty · votes+latency · issues · Ln,Col · actions│
└────────────────────────────────────────────────────────────────────────────┘
        ⇅  Editor ⇄ Swarm view toggle (top-right) — live agent heatmap
```

### Panels in detail

| Area | What it does |
| --- | --- |
| **Editor** | Transparent textarea over a regex-highlighted mirror (Python, TS/JS, Rust, Go, CSS). Gutter marks the caret line and per-line issue severities (red/amber/violet). `Tab` indents, `Ctrl+S` saves, `Ctrl+Enter` analyzes. |
| **Swarm completion** | 120 ms after you stop typing, the ALPHA cluster votes; the winning candidate appears as *ghost text* and all K candidates in a floating picker with kind + confidence. `Tab` accepts, `Esc` dismisses. The status bar shows the vote count + latency (e.g. `⌥ 7 votes · 43ms`). |
| **Explorer** | Filterable file tree with create / rename / delete (open tabs follow renames and deletions), plus workspace-wide **symbol search** that jumps straight to the reference. |
| **Assistant** | Chat with the swarm. Recognises intents (greeting, status, explain, review, refactor, security, tests, benchmark, model…), attaches your **active file automatically**, and renders answers as real Markdown — bold, code chips, bullets, quote callouts — with HTML escaping (XSS-safe). |
| **Problems** | Beta-cluster analysis of the active file: HYD-coded issues with severity, line:col, and suggested fixes. Clicking an issue scrolls the editor to the line. |
| **Refactor / Test tools** | Delta-cluster suggestions with concrete patches, and pytest / vitest / cargo-test skeletons generated from your functions. |
| **Output** | Live router log tail + parsed GGUF model card (name, format, version, architecture, context length, quantisation, size). |
| **Swarm dashboard** | 8 KPI tiles (agents, working now, tasks done, avg latency, completions, analyses, uptime, engine) · per-cluster utilisation cards · **100-cell agent heatmap** (idle / working / cooling) · live task feed streamed over WebSocket. |

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Tab` | Indent / accept ghost completion |
| `Ctrl+S` | Save file (also re-analyzes) |
| `Ctrl+Enter` | Analyze active file |
| `Esc` | Dismiss completion |
| click gutter/issue | Jump to line |

---

## 🐝 The Swarm

**100 agents** are partitioned into four clusters, each with a latency budget
the dispatcher enforces while fanning out:

| Cluster | Agents | Budget | Task kinds |
| --- | --- | --- | --- |
| **Alpha** | 30 | < 8 ms | inline completions (7 vote in parallel per request) |
| **Beta** | 25 | < 25 ms | AST inspection · static analysis |
| **Gamma** | 25 | < 50 ms | cross-file symbol resolution |
| **Delta** | 20 | < 120 ms | refactoring · test synthesis · security review |

**Agent lifecycle:** `idle → working → cooling → idle`. The dispatcher picks
idle agents round-robin, marks them working, and returns them through a short
cooling state (visible as blue cells in the heatmap) so bursts spread evenly
instead of hammering the first agents.

**Consensus (`swarm/consensus.ts`):** each voting agent returns ranked
candidates; votes are merged by normalised text, scored by
`Σ (vote weight × confidence)`, and annotated with a **support count** (how
many voters agreed) plus a cluster-level **agreement** metric — which is why
the UI can honestly say *"7 votes"*. The task feed shows every dispatched task
with its cluster and duration.

---

## 🧬 The Intelligence Engine

### Two backends, one interface (`engine/engine.ts`)

| Backend | What it is | When it's used |
| --- | --- | --- |
| **NeuralSim** *(default)* | A fully deterministic engine: regex tokenizer, feature-hashed embeddings, semantic chunker, n-gram transition model, curated knowledge base, and seven per-task simulators (`neuralsim_complete/analyze/resolve/refactor/tests/chat` + shared core). Answers instantly, offline, with zero hardware demands. | `--backend auto` (no llama-server found) or `--backend neuralsim` |
| **llama.cpp** | Adapter for a local [`llama-server`](https://github.com/ggml-org/llama.cpp) process + a from-scratch **GGUF binary parser** (`services/modelinfo.ts`) that reads magic/version/architecture/context-length/quantisation straight from `models/LFM2.5-230M-QAD-Q4_0.gguf`. | `--backend llamacpp`, or `auto` when a server answers on `--llama-server` |

### NeuralSim subsystems

| Subsystem | File | Role |
| --- | --- | --- |
| Tokenizer | `engine/tokenizer.ts` | Language detection (10 kinds), identifier/string/comment splitting, n-gram extraction, `parseLanguage()` API validator |
| Embeddings | `engine/embeddings.ts` | Feature-hashed vectors + cosine similarity — powers "same concept" matching |
| Chunker | `engine/chunker.ts` | Sliding-window context chunks under the token budget |
| Knowledge | `engine/knowledge.ts` | Curated stdlib / idiom / best-practice facts for grounded answers |
| Complete | `engine/neuralsim_complete.ts` | Context-aware candidate generation per voting agent |
| Analyze | `engine/neuralsim_analyze.ts` | Lightweight AST walk + rule engine → HYD-coded issues |
| Resolve | `engine/neuralsim_resolve.ts` | Definition/import/usage resolution across the whole workspace |
| Refactor | `engine/neuralsim_refactor.ts` | Smell detection with concrete patch previews |
| Tests | `engine/neuralsim_tests.ts` | Function discovery → pytest / vitest-jest / cargo skeletons |
| Chat | `engine/neuralsim_chat.ts` | Intent router + fact-grounded answer builders |

### Issue codes (`HYD-*`) emitted by analysis/review

| Code | Severity | Meaning |
| --- | --- | --- |
| `HYD-1001` | error | Undefined identifier referenced |
| `HYD-1002` | warning | Variable declared but never used (prefix `_` to silence) |
| `HYD-2001` | warning | Line longer than 120 chars |
| `HYD-3001` | error | `eval` / `exec` / `os.system` — arbitrary code execution |
| `HYD-3002` | warning | Bare `except:` swallowing `KeyboardInterrupt` |

*(plus TODO/FIXME markers and missing-docstring hints; each issue carries
`file`, `line`, `col`, `severity`, `kind`, `message` and an optional
`suggested` fix.)*

### Assistant intents

`greeting` · `status` · `explain` · `review` · `refactor` · `security` ·
`tests` · `benchmark` · `model` · fallback `general`. The router is keyword +
regex based and **attaches your active file as context**, so *"what are your
thoughts about this file?"* produces a grounded review of that exact buffer.
When a request falls outside the deterministic skillset, the assistant says so
explicitly and lists its skills — it never invents an answer.

---

## 🌐 REST API Reference

Base URL `http://127.0.0.1:8214` · all bodies are JSON.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness + version |
| GET | `/api/status` | Full snapshot: agents, clusters, engine, model, counters, traces |
| GET | `/api/telemetry` | Live agent grid + summary (same payload WS broadcasts) |
| GET | `/api/agents` | Agent list only |
| GET | `/api/model` | Parsed GGUF model card |
| GET | `/api/logs` | Last 200 structured log records |
| GET | `/api/tasks` | Recent task traces |
| GET | `/api/workspace` | File tree + stats |
| GET | `/api/workspace/files` | Flat file list with contents |
| GET | `/api/workspace/file?path=` | One file (404 if missing) |
| POST | `/api/files/save` · `/create` · `/delete` · `/rename` | Workspace CRUD (`path`, `content`, `from`/`to`) |
| GET | `/api/suggestions?prefix=` | Symbol autocomplete |
| GET | `/api/symbols?symbol=` | References for a symbol |
| POST | `/api/completions` | **Swarm completion** (7-voter consensus) |
| POST | `/api/analyze` | Beta cluster static analysis |
| POST | `/api/resolve` | Gamma cluster symbol resolution |
| POST | `/api/refactor` | Delta cluster refactoring |
| POST | `/api/tests` | Delta cluster test synthesis |
| POST | `/api/chat` | Assistant chat |

**Completion round-trip:**

```bash
curl -s http://127.0.0.1:8214/api/completions \
  -H "Content-Type: application/json" \
  -d '{"filePath":"src/main.py","lang":"python","source":"def add(a,b):\n    return a+b\n\nres = ad","cursor":40,"topK":5}'
```

```json
{
  "result": {
    "candidates": [
      { "text": "add", "kind": "function", "confidence": 0.92,
        "replaceStart": 39, "sourceAgent": "alpha-3" }
    ],
    "model": "models/LFM2.5-230M-QAD-Q4_0.gguf",
    "tokensPredicted": 3,
    "latencyMs": 43
  },
  "votes": 7,
  "traces": [ { "kind": "inline-completion", "cluster": "alpha", "durationMs": 43 } ]
}
```

## 🔌 WebSocket Protocol

Endpoint `ws://127.0.0.1:8214/ws` — the studio's task feed, agent grid and
topbar all run on this stream (`web/src/js/ws.js` auto-reconnects with
exponential backoff; the dot in the top-right corner shows connection state).

**On connect** the server immediately pushes a hello frame:

```json
{ "type": "hello", "service": "hydra-router", "agents": 100, "version": 1 }
```

**Every 2 seconds** — a full telemetry broadcast (same shape as `GET /api/telemetry`):

```json
{
  "type": "telemetry",
  "agents": [
    { "agentId": "alpha-07", "cluster": "alpha", "state": "working",
      "completed": 42, "avgLatencyMs": 3.1 }
  ],
  "summary": { "working": 7, "cooling": 12, "idle": 81 },
  "status": { "agents": 100, "uptimeS": 512, "completionsServed": 96, "engine": { "backend": "neuralsim" } }
}
```

**On every dispatched task** — a lightweight event used by the Swarm dashboard feed:

```json
{ "type": "task", "kind": "ast-inspection", "cluster": "beta", "latencyMs": 4, "seq": 118 }
```

Agent `state` cycles `idle → working → cooling → idle`; the grid renders
working cells in green, cooling cells in blue, so you can literally *watch the
swarm breathe* while you type.

---

## 🧩 VS Code Extension (`extensions/vscode-hydra`)

Prefer staying in VS Code? The bridge extension gives you the same swarm
without leaving your editor — **zero npm dependencies** (uses the built-in
`fetch` of VS Code's Node ≥ 18 runtime).

| Feature | How it works |
| --- | --- |
| **Swarm inline completions** | `InlineCompletionItemProvider` sends the document + caret to `POST /api/completions`; the consensus winner appears as native ghost text (Tab accepts). Debounced, cancellation-aware, silent when the router is down. |
| **Ask the Swarm** | Command `Hydra: Ask the Swarm` → input box → `POST /api/chat`. Answers land in the *Hydra Swarm* output channel with intent + latency (Markdown markers stripped for clean plain text). |
| **Analyze Active File** | Command `Hydra: Analyze Active File` → `POST /api/analyze`; HYD-coded findings printed with file:line:col. |
| **Live telemetry** | Status bar polls `GET /api/telemetry` and shows `$(zap) working/total agents`; clicking it runs `Hydra: Show Swarm Status`. |

**Run it:**

```powershell
npm start                                   # terminal 1 — the router
# terminal 2 — open extensions/vscode-hydra in VS Code and press F5,
# or package it into a .vsix from the repo root:
npm run ext:package
```

**Settings** (`hydra.*`): `endpoint` (default `http://127.0.0.1:8214`),
`debounceMs` (180), `statusPollMs` (3000).

## 📊 Benchmarking

`python/benchmark.py` (stdlib only — no pip installs) load-tests the router
end-to-end, including the full 7-voter consensus pipeline, and reports
mean / p50 / p90 / p99.

```powershell
python python/benchmark.py --runs 200 --concurrency 4            # completions (default)
python python/benchmark.py --mode health  --runs 500             # raw HTTP overhead
python python/benchmark.py --mode chat    --runs 50              # assistant pipeline
python python/benchmark.py --runs 100 --json benchmarks/run.json # machine-readable results
```

**Measured on this repo** (dev laptop, `--agents 100`, GGUF attached, concurrency 2, 40 runs):

```text
hydra-bench: 40 x complete -> http://127.0.0.1:8214/api/completions  (concurrency 2)
warmup: HTTP 200 in 241.8 ms

  runs        40 (ok 40, errors 0)
  wall time   0.818s (48.9 req/s)
  mean        40.55 ms
  min / max   21.34 / 75.61 ms
  p50 / p90   38.69 / 59.21 ms
  p99         75.61 ms
```

Exit code is non-zero if any request errors, so it doubles as a CI smoke test.

---

## 🧪 Testing

```powershell
npm test        # → node --test "server/test/*.test.ts"
```

10 tests, all deterministic, sub-second, no network:

| Suite | Covers |
| --- | --- |
| `tokenizer` | identifier/string/comment splitting, language detection from extension, `parseLanguage()` validation |
| `ngrams` | transition-table construction |
| `embeddings` | cosine similarity — same text ≈ 1.0, unrelated text lower |
| `analyze` | undefined identifiers (`HYD-1001`), long lines (`HYD-2001`), security smells (`HYD-3001`) |
| `consensus` | weighted vote merging, support counts, agreement metric |
| `chat` | intent routing (status / security / …) + grounded answers |
| `resolve` | cross-file definition/import/usage resolution |
| `tests` | pytest skeleton synthesis, annotation handling, existing-test skipping |

---

## 🗂 Project Structure

```text
Hydra-Agentic-IDE/
├── package.json               # workspaces: server · web · extensions/vscode-hydra
├── .env.example               # template for optional local secrets (gitignored .env)
├── models/                    # LFM2.5-230M-QAD-Q4_0.gguf (142 MB)
├── workspace/                 # sample project the IDE opens (8 files, seeded)
│
├── server/                    # the swarm router (TypeScript, runs natively on Node)
│   ├── src/
│   │   ├── index.ts           # CLI entry: arg/env parsing, boot banner
│   │   ├── config.ts          # typed config: host/port/agents/budgets/backend
│   │   ├── router.ts          # HTTP routing + static serving of web/dist
│   │   ├── ws.ts              # WebSocket hub (hello / telemetry / task frames)
│   │   ├── selfcheck.ts       # startup integrity probe
│   │   ├── engine/            # NeuralSim + llama.cpp backends (see below)
│   │   ├── services/          # hydra orchestrator · workspace · modelinfo (GGUF parser)
│   │   ├── swarm/             # clusters · agent · dispatcher · taskgraph · consensus
│   │   └── util/logger.ts     # leveled logger + ring buffer (feeds the Output panel)
│   └── test/core.test.ts      # the 10-test suite
│
├── web/                       # the browser studio (vanilla ES modules, zero deps)
│   ├── build.mjs              # copy build → web/dist (served by the router)
│   └── src/
│       ├── index.html         # 3-pane shell: explorer · editor · assistant
│       ├── css/ide.css        # dark swarm theme
│       └── js/                # editor · highlight · completions · diagnostics ·
│                              # explorer · assistant · md renderer · panels ·
│                              # swarm dashboard · ws client · api client
│
├── extensions/vscode-hydra/   # VS Code bridge (package.json + extension.js)
└── python/benchmark.py        # stdlib load benchmark
```

## ⚡ Performance

| Operation | Latency (measured) | Path |
| --- | --- | --- |
| `/api/health` | ~1 ms | router only |
| Assistant chat (deterministic intent) | ~1 ms | router → NeuralSim chat |
| Static analysis (whole file) | ~1–5 ms | Beta cluster (1 agent) |
| Symbol resolution | ~1–3 ms | Gamma cluster (1 agent) |
| Refactor / test synthesis | ~2–6 ms | Delta cluster (1 agent) |
| **Inline completion (full consensus)** | **p50 ≈ 39 ms · p90 ≈ 59 ms** | Alpha: 7 voting agents → merge |

**Why consensus costs so little:** the Alpha budget is 8 ms per agent and the
dispatcher fans out concurrently — wall time is one agent's budget plus the
merge, not 7×. Cluster budgets (`--budget-a/b/c/d`) let you trade depth for
latency; raising `--agents` adds capacity without touching per-request cost
(work is spread across more nodes, keeping any single agent's heat down).

**Tuning knobs, in order of impact:** `--agents` (capacity) ·
`--budget-a/b/c/d` (per-task ceilings) · `topK` in the completion request ·
debounce in `web/src/js/completions.js` / `hydra.debounceMs` in VS Code.

---

## 🔐 Security & Privacy

- **Fully offline.** No cloud calls, no telemetry, no accounts. Attach a model
  with llama.cpp and it *still* never leaves the machine.
- **No secrets in code.** There is nothing to leak — but if you ever add an
  integration that needs a key, put it in `.env` (already **gitignored**;
  `.env.example` is the tracked template) and read it via `config.ts`.
  The workspace also ships `.venv/`, `node_modules/`, `models/` and logs in
  `.gitignore`, so local artifacts never reach git.
- **Workspace sandbox.** All file CRUD is path-resolved inside the workspace
  root; traversal outside it is rejected (`server/src/services/workspace.ts`).
- **XSS-hardened studio.** Agent/model output is HTML-escaped *before* any
  Markdown transformation in the chat renderer — verified with an injection
  probe (`<script>`/`<img onerror>` render as inert text).
- **Bind address.** Defaults to `127.0.0.1`. Use `--host 0.0.0.0` only on
  trusted networks — the API has no auth by design.

---

## 🩺 Troubleshooting

| Symptom | Fix |
| --- | --- |
| **The IDE link doesn't open** | The router isn't running — `npm start`, then open `http://127.0.0.1:8214`. The URL only lives while the process lives. |
| Top-right dot is red / feed frozen | WebSocket dropped. Refresh the page; the client also auto-reconnects with backoff. |
| `EADDRINUSE` on port 8214 | Another router is running (`Get-Process node`) or pick another: `--port 8300`. |
| Topbar shows *neuralsim (no gguf)* although the model exists | Expected without llama.cpp. Start `llama-server -m models/LFM2.5-230M-QAD-Q4_0.gguf --port 8215` and run `npm start -- --backend llamacpp`. |
| Assistant says a request is outside its skillset | Working as intended (honest fallback). Use the listed skills, or attach llama.cpp for open-ended generation. |
| `npm test` / `npx tsc` fails after fresh clone | Run `npm install` once — dev tooling (typescript, `@types/node`, `@types/ws`) is dev-only; runtime stays dependency-free. |
| Stale red squiggles in VS Code | After installing devDependencies: **Developer: Reload Window**. |
| Benchmark can't connect | Start the router first; check `--url` if you changed the port. |
| Python missing for the benchmark | Any Python ≥ 3.10 works — the script is stdlib-only. |

---

## 🗺 Roadmap

- Streaming chat over the existing WebSocket hub
- Multi-root workspaces + git integration in the studio
- LSP adapter so any editor can consume the swarm
- Distributed mode: agents across processes/machines, consensus over the wire
- Optional GPU inference path (`node-llama-cpp`) behind the same engine interface
- Consensus strategies beyond weighted voting (debate / judge patterns) in `swarm/consensus.ts`

---

## 📄 License

[Apache-2.0](LICENSE) — use it, fork it, ship it.

<div align="center">

**Hydra-IDE** — *a hundred agents, one answer, zero cloud.* 🐍⚡

</div>







