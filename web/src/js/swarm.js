/** Swarm dashboard: KPIs, cluster cards, agent grid, live task feed. */
import { el, clear, fmtUptime } from './tools.js';

const CLUSTERS = ['alpha', 'beta', 'gamma', 'delta'];
const feed = [];

export function initSwarm(ui) {
  let cells = [];

  function update(data) {
    // data: { agents: AgentStats[], summary, status }
    const agents = data.agents ?? [];
    const status = data.status ?? {};
    const summary = status.summary ?? data.summary ?? {};

    // ---- KPIs -------------------------------------------------------------
    const working = agents.filter((a) => a.state === 'working').length;
    const completed = agents.reduce((acc, a) => acc + (a.completed ?? 0), 0);
    const avgLatency = agents.length > 0
      ? agents.reduce((acc, a) => acc + (a.avgLatencyMs ?? 0), 0) / agents.length : 0;
    const kpis = [
      ['agents', status.agents ?? agents.length],
      ['working now', working],
      ['tasks done', completed],
      ['avg latency', `${avgLatency.toFixed(1)}ms`],
      ['completions', status.completionsServed ?? 0],
      ['analyses', status.analyzeCount ?? 0],
      ['uptime', fmtUptime(status.uptimeS ?? 0)],
      ['engine', status.engine?.backend ?? '—'],
    ];
    clear(ui.swarmKpis);
    for (const [l, v] of kpis) {
      ui.swarmKpis.append(el('div', { class: 'kpi' },
        el('div', { class: 'v', text: String(v) }),
        el('div', { class: 'l', text: l }),
      ));
    }

    // ---- cluster cards ------------------------------------------------------
    clear(ui.clusterCards);
    const clusters = status.clusters ?? [];
    for (const c of clusters) {
      const pct = c.agents > 0 ? Math.round((c.working / c.agents) * 100) : 0;
      ui.clusterCards.append(el('div', { class: 'ccard' },
        el('h3', { text: `${c.key} cluster` }),
        el('div', { class: 'row' }, el('span', { text: 'agents' }), el('b', { text: String(c.agents) })),
        el('div', { class: 'row' }, el('span', { text: 'working' }), el('b', { text: String(c.working) })),
        el('div', { class: 'row' }, el('span', { text: 'avg latency' }), el('b', { text: `${c.avgLatencyMs}ms` })),
        el('div', { class: 'row' }, el('span', { text: 'backlog' }), el('b', { text: String(c.backlog) })),
        el('div', { class: 'row' }, el('span', { text: 'completed' }), el('b', { text: String(c.completed) })),
        el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })),
      ));
    }

    // ---- agent grid ---------------------------------------------------------
    if (cells.length !== agents.length) {
      clear(ui.agentGrid);
      cells = agents.map((a) => {
        const c = el('div', { class: 'agent', title: a.agentId });
        ui.agentGrid.append(c);
        return c;
      });
    }
    agents.forEach((a, i) => {
      const cell = cells[i];
      if (!cell) return;
      cell.className = `agent${a.state === 'working' ? ' working' : a.state === 'cooling' ? ' cooling' : ''}`;
      cell.title = `${a.agentId} · ${a.state} · done ${a.completed} · avg ${a.avgLatencyMs}ms`;
    });
  }

  function pushTask(t) {
    // t: { kind, agent, latencyMs, seq }
    feed.unshift({ ...t, at: new Date().toLocaleTimeString() });
    if (feed.length > 40) feed.pop();
    renderFeed();
  }

  function seedFromTraces(traces) {
    for (const tr of (traces ?? []).slice(-20).reverse()) {
      feed.push({ kind: tr.kind, agent: tr.cluster, latencyMs: tr.durationMs, at: new Date(tr.at).toLocaleTimeString() });
    }
    if (feed.length > 40) feed.length = 40;
    renderFeed();
  }

  function renderFeed() {
    clear(ui.taskFeed);
    if (feed.length === 0) { ui.taskFeed.append(el('div', { class: 'empty', text: 'waiting for swarm tasks…' })); return; }
    for (const t of feed) {
      ui.taskFeed.append(el('div', { class: 't' },
        el('span', { text: t.at ?? '' }),
        el('span', { class: 'cl', text: t.agent ?? t.cluster ?? '—' }),
        el('span', { text: t.kind ?? 'task' }),
        el('span', { class: 'ms', text: `${t.latencyMs ?? 0}ms` }),
      ));
    }
  }

  renderFeed();
  return { update, pushTask, seedFromTraces };
}

export { CLUSTERS };
