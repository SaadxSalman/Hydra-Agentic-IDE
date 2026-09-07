/** Assistant panel — chat with the swarm (engine-backed). */
import { api } from './api.js';
import { el, clear } from './tools.js';

export function initAssistant(ui) {
  const log = ui.chatLog;
  let currentFile = () => undefined;

  addBot('Hydra assistant online. Ask about the swarm, your code, security, or performance — I route to the right agent cluster.', 'hello');

  ui.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = ui.chatInput.value.trim();
    if (!prompt) return;
    ui.chatInput.value = '';
    addUser(prompt);
    const typing = addBot('…thinking', 'pending');
    try {
      const r = await api.chat(prompt, currentFile());
      typing.querySelector('.who').innerHTML =
        `<b>swarm · ${r.intent ?? 'chat'}</b> · ${r.latencyMs ?? 0}ms`;
      typing.querySelector('.bubble').textContent = r.answer ?? '(empty)';
    } catch (err) {
      typing.querySelector('.who').innerHTML = '<b>swarm · error</b>';
      typing.querySelector('.bubble').textContent = `Request failed: ${err.message}`;
    }
    log.scrollTop = log.scrollHeight;
  });

  function addRow(kind, whoText, bodyText) {
    const row = el('div', { class: `msg ${kind}` },
      el('div', { class: 'who', text: whoText }),
      el('div', { class: 'bubble', text: bodyText }),
    );
    log.append(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }
  function addUser(text) { addRow('user', 'you', text); }
  function addBot(text, who) { return addRow('bot', `swarm · ${who ?? ''}`, text); }

  return { setFileProvider: (fn) => { currentFile = fn; }, clear: () => clear(log) };
}
