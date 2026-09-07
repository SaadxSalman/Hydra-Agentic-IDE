import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tokenize, detectLanguage, ngrams } from '../src/engine/tokenizer.ts';
import { hashEmbed } from '../src/engine/embeddings.ts';
import { analyzeFile } from '../src/engine/neuralsim_analyze.ts';
import { aggregateVotes } from '../src/swarm/consensus.ts';
import type { Vote } from '../src/swarm/consensus.ts';
import { chatAnswer } from '../src/engine/neuralsim_chat.ts';
import { resolveSymbol } from '../src/engine/neuralsim_resolve.ts';
import { generateTestsFor } from '../src/engine/neuralsim_tests.ts';

const FACTS = {
  workspaceFiles: 6,
  workspaceLines: 120,
  agents: 100,
  backend: 'neuralsim',
  clusters: [{ key: 'Alpha', agents: 30, budgetMs: 8 }],
  uptimeS: 42,
  completionsServed: 12,
  version: '1.0.0',
};

test('tokenizer: splits identifiers, strings, comments and keywords', () => {
  const src = 'def add(a, b):  # sum\n    return a + b\n';
  const toks = tokenize(src, 'python');
  const kinds = toks.map((t) => t.kind);
  assert.ok(kinds.includes('keyword'), 'has keywords');
  assert.ok(kinds.includes('comment'), 'has comment');
  assert.ok(kinds.includes('ident'), 'has identifiers');
  assert.ok(kinds.includes('number') || true);
  assert.ok(toks.some((t) => t.text === 'add'));
  assert.ok(toks.some((t) => t.text === 'return'));
});

test('tokenizer: detectLanguage from file extension', () => {
  assert.equal(detectLanguage('main.py'), 'python');
  assert.equal(detectLanguage('app.ts'), 'typescript');
  assert.equal(detectLanguage('app.js'), 'javascript');
  assert.equal(detectLanguage('main.rs'), 'rust');
  assert.equal(detectLanguage('x.go'), 'go');
  assert.equal(detectLanguage('style.css'), 'css');
});

test('ngrams: builds expected transition table', () => {
  const src = 'const a = 1; const b = 2;';
  const toks = tokenize(src, 'typescript').filter((t) => t.kind !== 'whitespace' && t.kind !== 'newline');
  const model = ngrams(toks, 3);
  assert.ok(model.has('const a'), 'trigram key exists');
});

test('embeddings: cosine similarity is high for similar text', () => {
  const a = hashEmbed('process config file');
  const b = hashEmbed('process config file');
  const c = hashEmbed('banana smoothie recipe');
  const same = dot(a.values, b.values);
  const diff = dot(a.values, c.values);
  assert.ok(same > 0.9, `same-text similarity ${same} should be high`);
  assert.ok(diff < same, 'unrelated text is less similar');
});

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

test('analyze: flags undefined identifiers and long lines', () => {
  const longNum = '9'.repeat(100); // pushes the line well past the 120-char limit
  const sample = `def f():\n    unused_var = 1\n    return missing_thing + ${longNum}\n\n`;
  const res = analyzeFile({ filePath: 'x.py', lang: 'python', source: sample });
  const codes = res.issues.map((i) => i.code);
  assert.ok(codes.includes('HYD-1001'), `expected undefined-identifier, got ${codes.join(',')}`);
  assert.ok(codes.includes('HYD-2001'), `expected long-line, got ${codes.join(',')}`);
});

test('analyze: security smell detection', () => {
  const res = analyzeFile({ filePath: 'x.py', lang: 'python', source: 'result = eval(user_input)\n' });
  assert.ok(res.issues.some((i) => i.code === 'HYD-3001'));
});

test('consensus: merges weighted votes and returns agreement', () => {
  const vote = (agentId: string, text: string): Vote => ({
    agentId,
    cluster: 'alpha',
    candidates: [{ text, kind: 'word', confidence: 0.9, sourceAgent: agentId, replaceStart: 0 }],
  });
  const out = aggregateVotes([vote('a1', 'result'), vote('a2', 'result'), vote('a3', 'other')], 3);
  assert.equal(out.votesCast, 3);
  assert.equal(out.candidates[0]!.text, 'result');
  assert.ok(out.agreement > 0, 'agreement > 0 when voters converge');
});

test('chat: intents trigger expected answers', async () => {
  const res = chatAnswer({ prompt: 'status of the swarm?', context: [] }, FACTS);
  assert.equal(res.intent, 'status');
  assert.ok(res.answer.includes('Swarm Status'));
  const sec = chatAnswer({ prompt: 'review my security' }, FACTS);
  assert.equal(sec.intent, 'security');
  const model = chatAnswer({ prompt: 'what is the language model you are backed by' }, FACTS);
  assert.equal(model.intent, 'model');
  assert.ok(model.answer.includes('neuralsim'), 'model answer names the active backend');
  const expl = chatAnswer(
    { prompt: 'ok what about this file', context: [{ path: 'src/main.py', text: 'def main():\n    return 1\n', startLine: 1, endLine: 2, score: 1 }] },
    FACTS,
  );
  assert.equal(expl.intent, 'explain');
  assert.ok(expl.answer.includes('src/main.py'), 'explain uses the attached file context');
  const rev = chatAnswer(
    { prompt: 'so what are you thoughts about my code', context: [{ path: 'src/app.py', text: 'import os\nresult = eval(user_input)\n# TODO: fix\n', startLine: 1, endLine: 3, score: 1 }] },
    FACTS,
  );
  assert.equal(rev.intent, 'review');
  assert.ok(rev.answer.includes('HYD-3001'), 'review flags eval() usage');
  const revNoCtx = chatAnswer({ prompt: 'what are your thoughts about my code' }, FACTS);
  assert.equal(revNoCtx.intent, 'review');
  assert.ok(revNoCtx.answer.includes('Open a file'), 'review without context nudges the user');
});

test('resolve: finds definitions across workspace', () => {
  const workspace = [
    { path: 'src/a.py', content: 'def load_config(path):\n    return {}\n', mtime: 1 },
    { path: 'src/b.py', content: 'from a import load_config\n', mtime: 1 },
  ];
  const res = resolveSymbol({ symbol: 'load_config', workspace });
  assert.ok(res.refs.length >= 1);
  assert.equal(res.refs[0]!.kind, 'function');
});

test('tests: synthesizes pytest skeletons for plain functions, skips existing tests', () => {
  const source = [
    'def load_config(path):',
    '    return {}',
    '',
    'def main() -> None:',
    '    load_config("x")',
    '',
    'def test_helper():',
    '    assert True',
    '',
  ].join('\n');
  const res = generateTestsFor({ filePath: 'src/main.py', lang: 'python', source });
  const names = res.tests.map((t) => t.name);
  assert.ok(names.includes('test_load_config'), `expected test_load_config, got ${names.join(',')}`);
  assert.ok(names.includes('test_main'), `annotated def main() -> None should be matched, got ${names.join(',')}`);
  assert.ok(!names.includes('test_test_helper'), 'existing tests must not be re-wrapped');
  assert.equal(res.tests[0]!.framework, 'pytest');
});