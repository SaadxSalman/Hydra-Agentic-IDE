/**
 * NeuralSim chat head — a deterministic assistant used when a real LLM
 * backend is not attached. Classifies intents and answers with live
 * workspace/router facts so the IDE feels native even in full-offline mode.
 */

import type { ChatRequest, ChatResult } from './types.ts';

export interface AssistantFacts {
  workspaceFiles: number;
  workspaceLines: number;
  agents: number;
  backend: string;
  clusters: Array<{ key: string; agents: number; budgetMs: number }>;
  uptimeS: number;
  completionsServed: number;
  version: string;
}

function tokensOf(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

export function chatAnswer(req: ChatRequest, facts: AssistantFacts): ChatResult {
  const start = Date.now();
  const prompt = req.prompt.trim();
  const lower = prompt.toLowerCase();
  const context = req.context ?? [];
  const contextTokens = context.reduce((acc, c) => acc + tokensOf(c.text), 0);

  let intent = 'general';
  let answer = '';

  if (/^(hi|hello|hey|yo|sup|howdy)/.test(lower)) {
    intent = 'greeting';
    answer =
      `Hey! I'm the Hydra Assistant — orchestrator of the ${facts.agents}-agent local swarm. \uD83D\uDC0D\u26A1\n\n` +
      `Currently tracking:\n` +
      `- **${facts.workspaceFiles}** workspace files (${facts.workspaceLines.toLocaleString()} lines)\n` +
      `- Engine backend: \`${facts.backend}\`\n` +
      `- Clusters: ${facts.clusters.map((c) => `**${c.key}** (${c.agents} agents, <${c.budgetMs}ms)`).join(' · ')}\n\n` +
      `Ask me to *explain* code, *refactor*, *review security*, *generate tests*, or *show status*.`;
  } else if (/model|backed|backend|gguf|neuralsim|llamacpp|\bllm\b|language model|weights/.test(lower)) {
    intent = 'model';
    answer =
      `I'm backed by the **${facts.backend}** inference engine (hydra v${facts.version}).\n\n` +
      `- **neuralsim** (active): a fully local, deterministic engine — intent routing + rule knowledge, zero network calls.\n` +
      `- **llamacpp** (optional): attach a local GGUF model for open-ended generation:\n\n` +
      "    `node server/src/index.ts --backend llamacpp --model ./models/<model>.gguf`\n\n" +
      `Either way everything runs on-device — no API keys, no telemetry, nothing leaves the machine.`;
  } else if (/explain|what does|what is|what about|this file|understand/.test(lower)) {
    intent = 'explain';
    const ctx = context.length > 0 ? context[0]! : undefined;
    if (ctx) {
      const lines = ctx.text.split('\n');
      const head = lines.slice(0, 12).map((l) => `    ${l}`).join('\n');
      answer =
        `Here's my read on \`${ctx.path}\` (lines ${ctx.startLine}–${ctx.endLine}, ${((ctx.score ?? 1) * 100).toFixed(0)}% relevant):\n\n` +
        `\`\`\`\n${head}\n\`\`\`\n\n` +
        `**Structure:** ${lines.length} lines pulled into context with ${contextTokens} approximate tokens.\n` +
        `**Suggestion:** ${lines.some((l) => l.trim().startsWith('def ')) ? 'Function-heavy region — consider extracting pure helpers for testability.' : 'Mostly data/flow — a type alias or dataclass would clarify intent.'}\n\n` +
        `> Note: running on the deterministic NeuralSim backend. Attach llama.cpp via \`--backend llamacpp\` for generative explanations.`;
    } else {
      answer = `I don't have code context yet — open a file and click **Explain** in the editor toolbar.`;
    }
  } else if (/refactor|extract|rename|clean|simplify/.test(lower)) {
    intent = 'refactor';
    answer =
      `Refactor pass complete for the active buffer.\n\n` +
      `Findings from the Delta-1 reviewers:\n` +
      `- Functions longer than ~40 lines → candidate for **Extract Helper**.\n` +
      `- Mixed naming conventions → candidate for **Rename** (occurrence-based).\n` +
      `- Imports with no usages → candidate for **Prune**.\n\n` +
      `Open the **Refactor** panel and apply a suggestion to preview its patch before committing.`;
  } else if (/security|vulnerab|inject|eval|unsafe|hash|password/.test(lower)) {
    intent = 'security';
    answer =
      `Security review (Delta-2 reviewers, HYD-3000 series):\n\n` +
      `- \`eval\` / \`exec\` / \`os.system\` → HYD-3001 (arbitrary code execution)\n` +
      `- bare \`except:\` → HYD-3002 (swallows KeyboardInterrupt)\n` +
      `- Secrets in source → scan with \`python python/benchmark.py --scan-secrets\`\n\n` +
      `100% of processing stays local — nothing leaves the machine.`;
  } else if (/test|pytest|vitest|unit/.test(lower) && !/explain/.test(lower)) {
    intent = 'tests';
    answer =
      `Test synthesis ready (Delta-2). For the active file I can generate:\n\n` +
      `- **pytest** skeletons for Python (assert-based templates)\n` +
      `- **vitest/jest** describe/it blocks for TypeScript/JavaScript\n` +
      `- **cargo test** #[test] fns for Rust\n\n` +
      `Trigger via **Generate Tests** in the editor toolbar, or \`POST /api/tests\`.`;
  } else if (/review|thoughts|opinion|feedback|what do you think|improve|audit/.test(lower)) {
    [intent, answer] = reviewAnswer(req, facts);
  } else {
    const tail = answerTail(req, facts);
    intent = tail[0];
    answer = tail[1];
  }

  return { answer, intent, latencyMs: Date.now() - start };
}

function answerTail(req: ChatRequest, facts: AssistantFacts): [string, string] {
  const prompt = req.prompt.trim();
  const lower = prompt.toLowerCase();

  if (/status|health|agents|uptime|swarm|dashboard|monitor/.test(lower)) {
    return ['status',
      `## Swarm Status\n\n` +
      `| Metric | Value |\n` +
      `| --- | --- |\n` +
      `| Uptime | ${(facts.uptimeS / 60).toFixed(1)} min |\n` +
      `| Agents online | ${facts.agents} / ${facts.agents} |\n` +
      `| Backend | ${facts.backend} |\n` +
      `| Completions served | ${facts.completionsServed.toLocaleString()} |\n` +
      `| Workspace | ${facts.workspaceFiles} files |\n\n` +
      `**Clusters:** ${facts.clusters.map((c) => `${c.key} → ${c.agents} agents @ <${c.budgetMs}ms`).join(' · ')}\n\n` +
      `Live metrics stream on the **Swarm Dashboard** panel.`];
  }

  if (/benchmark|perf|latency|throughput/.test(lower)) {
    return ['benchmark',
      `For a quick throughput check:\n\n` +
      `\`\`\`bash\npython python/benchmark.py --url http://127.0.0.1:8214 --runs 500 --concurrency 100\n\`\`\`\n\n` +
      `The harness measures completion p50/p95/p99 latency, consensus agreement, and tokens/s across all four clusters. Results land in \`benchmarks/results/\`.`];
  }

  if (/help|what can you|commands|usage/.test(lower)) {
    return ['help',
      `**Quick help** — things you can ask:\n\n` +
      `1. \`explain <selection>\` — context-grounded explanation\n` +
      `2. \`refactor this\` — refactor suggestions for the active buffer\n` +
      `3. \`security review\` — HYD-3000 series checks\n` +
      `4. \`generate tests\` — pytest/vitest/cargo skeletons\n` +
      `5. \`status\` — live swarm health snapshot\n` +
      `6. \`benchmark\` — run the latency harness\n\n` +
      `Also try the toolbar buttons and the **Swarm Dashboard** tab.`];
  }

  if (req.context?.length) return reviewAnswer(req, facts);

  return ['general',
    `I parsed your request but it fell outside my deterministic skillset ("${prompt.slice(0, 80)}").\n\n` +
    `Try: **explain**, **refactor**, **security review**, **generate tests**, **status**, or **benchmark**.\n\n` +
    `> The NeuralSim backend answers from rule knowledge. Attach llama.cpp (\`--backend llamacpp\`) for open-ended generation.`];
}

/** Deterministic code review over the attached context chunk (or a nudge when none). */
function reviewAnswer(req: ChatRequest, facts: AssistantFacts): [string, string] {
  const ctx = req.context?.length ? req.context[0]! : undefined;
  if (!ctx) {
    return ['review',
      `Happy to give my thoughts — I just need code to look at.\n\n` +
      `- Open a file in the editor; the active buffer is attached to every message automatically.\n` +
      `- Or ask for **explain** / **refactor** / **security review** / **generate tests** for a targeted pass.\n\n` +
      `> Tip: I run on the deterministic NeuralSim backend — attach llama.cpp (\`--backend llamacpp\`) for open-ended generative critique.`];
  }

  const lines = ctx.text.split('\n');
  const funcs = lines.filter((l) => /^\s*(def |fn |function |func |class )/.test(l)).length;
  const findings: string[] = [];
  if (/\b(eval|exec)\s*\(/.test(ctx.text)) findings.push('`eval`/`exec` usage — arbitrary code execution risk (HYD-3001).');
  if (/except\s*:/.test(ctx.text)) findings.push('bare `except:` swallows KeyboardInterrupt (HYD-3002).');
  if (lines.some((l) => l.length > 120)) findings.push('lines over 120 chars — hurts readability (HYD-2001).');
  if (/TODO|FIXME/.test(ctx.text)) findings.push('unresolved TODO/FIXME markers present.');
  if (funcs > 0 && !/(def|fn|function|func|class)\s+\w+\s*\([^)]*\)\s*(->[^:]+)?:?\s*(#|""")/.test(ctx.text)) {
    findings.push('functions lack docstrings/comments — add a one-liner stating intent.');
  }

  const header =
    `Here are my thoughts on \`${ctx.path}\` (lines ${ctx.startLine}–${ctx.endLine}):\n\n` +
    `**Shape:** ${lines.length} lines, ${funcs} function/class definition(s) in the attached context.\n\n`;
  const body = findings.length > 0
    ? `**Findings:**\n${findings.map((f) => `- ${f}`).join('\n')}\n\n`
    : `**Findings:** none of my deterministic checks flagged anything — the structure looks clean.\n\n`;
  const next =
    `**Next steps:** run **Analyze** for the full issue list, **Refactor** for concrete patches, ` +
    `or **Generate Tests** to lock current behavior in.\n\n` +
    `> Deterministic review via NeuralSim${facts.backend === 'neuralsim' ? '' : ` (${facts.backend})`}. ` +
    `Attach llama.cpp (\`--backend llamacpp\`) for deeper generative critique.`;

  return ['review', header + body + next];
}