# vscode-hydra — Hydra-IDE Swarm Bridge

Connects VS Code to a running [hydra-router](../../Readme.md) instance.

## Features

| Feature | How it works |
| --- | --- |
| **Swarm inline completions** | An `InlineCompletionItemProvider` sends the active document + caret to `POST /api/completions`; the Alpha cluster's consensus-ranked candidate appears as ghost text (Tab accepts, VS Code native UX). |
| **Ask the Swarm** | `Hydra: Ask the Swarm` command → input box → `POST /api/chat`. Answers land in the *Hydra Swarm* output channel with intent + latency. |
| **Analyze Active File** | `Hydra: Analyze Active File` → `POST /api/analyze`; findings (HYD-NNNN codes, severities, suggested fixes) are printed to the output channel. |
| **Live telemetry** | The status bar polls `GET /api/telemetry` and shows `working/total agents`; clicking it runs `Hydra: Show Swarm Status` for a full summary. |

## Setup

1. Start the router (repo root):
   ```
   npm run dev
   ```
2. Open this folder (`extensions/vscode-hydra`) in VS Code and press **F5** to
   launch an Extension Development Host, or package it:
   ```
   npm run ext:package   # from the repo root (requires npx/vsce)
   ```
3. Settings (`hydra.*`):
   - `hydra.endpoint` — router base URL (default `http://127.0.0.1:8214`)
   - `hydra.debounceMs` — completion debounce (default `180`)
   - `hydra.statusPollMs` — status bar poll interval (default `3000`)

The extension uses the fetch API built into VS Code's Node runtime (>= 18) —
no npm dependencies to install.
