import { MOCK } from '../src/mock.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';

// Cada aba: título, texto de apoio, colunas e como renderizar a linha.
const TABS = {
  nomenclatura: { label: 'Nomenclatura', title: 'Arquivos com nome fora do padrão',
    note: 'Documentos enviados pelo cliente cujo nome não segue o padrão.',
    cols: ['Empresa', 'CNPJ', 'Pasta', 'Arquivo', 'Enviado em'],
    row: r => [r.empresa, r.cnpj, r.pasta, r.arquivo, fmt(r.data)] },
  pastas: { label: 'Pastas fora do padrão', title: 'Empresas com pasta fora do padrão',
    note: 'Pastas de primeiro nível que não fazem parte da estrutura oficial.',
    cols: ['Empresa', 'CNPJ', 'Pasta encontrada', 'Arquivos'],
    row: r => [r.empresa, r.cnpj, r.pasta, r.arquivos] },
  semEnvio: { label: 'Treinados sem envio', title: 'Clientes treinados que não estão enviando',
    note: 'Clientes já treinados e com demanda, sem envio recente no portal.',
    cols: ['Empresa', 'CNPJ', 'Treinado em', 'Demanda', 'Situação'],
    row: r => [r.empresa, r.cnpj, fmt(r.treinadoEm), r.demanda,
      r.dias === null ? '<span class="chip">Nunca enviou</span>' : `<span class="chip warn">${r.dias} dias sem envio</span>`], html: [4] },
  notificacoes: { label: 'Notificações', title: 'Funcionários com notificação de tarefa desativada',
    note: 'Quem tem tarefas ativas mas não recebe aviso quando chega tarefa nova.',
    cols: ['Funcionário', 'Setor', 'E-mail', 'Tarefas ativas'],
    row: r => [r.nome, r.setor, r.email, r.tarefasAtivas] },
};

let current = 'geral';
const q = () => document.getElementById('search').value.trim().toLowerCase();

function renderNav() {
  const items = [['geral', 'Visão geral', 0], ...Object.entries(TABS).map(([k, t]) => [k, t.label, MOCK[k].length])];
  document.getElementById('nav').innerHTML = items.map(([k, l, n]) =>
    `<button data-k="${k}" ${k === current ? 'aria-current="page"' : ''}>${esc(l)}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('');
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.k)));
}

function renderGeral() {
  const sev = k => (MOCK[k].length === 0 ? 'ok' : k === 'semEnvio' || k === 'notificacoes' ? 'bad' : 'warn');
  const when = new Date(MOCK.coletadoEm).toLocaleString('pt-BR');
  return `<p class="note">Última coleta (exemplo): ${when}</p><div class="cards">${Object.entries(TABS).map(([k, t]) =>
    `<div class="card ${sev(k)}" data-go="${k}"><b>${MOCK[k].length}</b><span>${esc(t.title)}</span></div>`).join('')}</div>`;
}

function renderTable(k) {
  const t = TABS[k];
  const rows = MOCK[k].filter(r => !q() || JSON.stringify(Object.values(r)).toLowerCase().includes(q()));
  if (!rows.length) return `<p class="note">${t.note}</p><div class="panel"><div class="empty">Nenhuma pendência encontrada.</div></div>`;
  const html = new Set(t.html || []);
  return `<p class="note">${t.note}</p><div class="panel"><table><thead><tr>${t.cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${t.row(r).map((c, i) => `<td>${html.has(i) ? c : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function render() {
  document.getElementById('title').textContent = current === 'geral' ? 'Visão geral' : TABS[current].title;
  document.getElementById('view').innerHTML = current === 'geral' ? renderGeral() : renderTable(current);
  document.querySelectorAll('[data-go]').forEach(c => c.addEventListener('click', () => go(c.dataset.go)));
  renderNav();
}
function go(k) { current = k; render(); }

document.getElementById('search').addEventListener('input', () => { if (current !== 'geral') render(); });
render();
