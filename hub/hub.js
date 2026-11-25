import { SAMPLE } from '../src/mock.js';
import { loadConfig, formatCnpj } from '../src/config.js';
import { analyze } from '../src/rules.js';
import { renderConfig } from './config-view.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';
const ic = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  home: ic('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  file: ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  folder: ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>'),
  bell: ic('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
  bellOff: ic('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/>'),
  moon: ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  chev: ic('<path d="M6 9l6 6 6-6"/>'),
  right: ic('<path d="M9 6l6 6-6 6"/>'),
  info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
};
$('themeBtn').innerHTML = I.moon;
$('bell').innerHTML = I.bell;
$('cfgBtn').innerHTML = I.gear;

const secClass = s => ({ 'Pessoal': 'sec-pessoal', 'Contábil': 'sec-contabil', 'Fiscal': 'sec-fiscal', 'Financeiro': 'sec-financeiro' }[s] || 'sec-outro');
const sector = s => `<span class="sector ${secClass(s)}">${esc(s)}</span>`;
const badge = (t, c) => `<span class="badge ${c}">${esc(t)}</span>`;
const SETORES = ['Todos', 'Pessoal', 'Fiscal', 'Contábil', 'Financeiro'];

const TABS = {
  nomenclatura: { label: 'Nomenclatura', icon: I.file, sev: 's-warn', title: 'Arquivos com nome fora do padrão',
    hint: 'Enviados pelo cliente, fora do padrão de nome', setores: r => [r.setor],
    cols: [['Empresa'], ['CNPJ', 'num'], ['Setor', 'col-sec'], ['Pasta', 'col-sec'], ['Arquivo'], ['Enviado em', 'num r']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(formatCnpj(r.cnpj)), sector(r.setor), esc(r.pasta), esc(r.arquivo), fmt(r.data)],
    step: r => [`Arquivo fora do padrão · ${r.empresa}`, `${r.pasta} · ${r.arquivo}`] },
  pastas: { label: 'Pastas fora do padrão', icon: I.folder, sev: 's-warn', title: 'Empresas com pasta fora do padrão',
    hint: 'Pasta de primeiro nível que não está na estrutura oficial', setores: () => [],
    cols: [['Empresa'], ['CNPJ', 'num'], ['Pasta encontrada'], ['Arquivos', 'num r']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(formatCnpj(r.cnpj)), esc(r.pasta), r.arquivos],
    step: r => [`Pasta fora do padrão · ${r.empresa}`, `"${r.pasta}" com ${r.arquivos} arquivos`] },
  semEnvio: { label: 'Treinados sem envio', icon: I.clock, sev: 's-late', title: 'Clientes treinados que não estão enviando',
    hint: 'Treinados, com demanda, sem envio recente no portal', setores: r => r.demanda,
    cols: [['Empresa'], ['CNPJ', 'num'], ['Treinado em', 'num col-sec'], ['Demanda'], ['Situação']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(formatCnpj(r.cnpj)), fmt(r.treinadoEm), r.demanda.map(sector).join(''),
      r.dias === null ? badge('Nunca enviou', 's-late') : badge(`${r.dias} dias sem envio`, 's-warn')],
    step: r => [`Sem envio no portal · ${r.empresa}`, r.dias === null ? 'Treinado e nunca enviou nada' : `Último envio há ${r.dias} dias`] },
  notificacoes: { label: 'Notificações', icon: I.bellOff, sev: 's-soon', title: 'Funcionários com notificação desativada',
    hint: 'Têm tarefas ativas e não recebem aviso de tarefa nova', setores: r => [r.setor],
    cols: [['Funcionário'], ['Setor'], ['E-mail', 'col-sec'], ['Tarefas ativas', 'num r']],
    row: r => [`<span class="emp">${esc(r.nome)}</span>`, sector(r.setor), esc(r.email), r.tarefasAtivas],
    step: r => [`Notificação desativada · ${r.nome}`, `${r.tarefasAtivas} tarefas ativas sem aviso`] },
};
const KEYS = Object.keys(TABS);

let cfg = null, R = { nomenclatura: [], pastas: [], semEnvio: [], notificacoes: [] };
const recompute = () => { R = analyze(SAMPLE, cfg); };
const state = { view: 'hoje', setor: 'Todos', open: Object.fromEntries(KEYS.map(k => [k, true])), recados: new Set(SAMPLE.recados.map(r => r.id)) };
const term = () => $('search').value.trim().toLowerCase();
const data = k => R[k].filter(r => {
  const s = TABS[k].setores(r).filter(Boolean);
  if (state.setor !== 'Todos' && s.length && !s.includes(state.setor)) return false;
  if (state.setor !== 'Todos' && !s.length) return false;
  return !term() || Object.values(r).join(' ').toLowerCase().includes(term());
});
const total = () => KEYS.reduce((n, k) => n + data(k).length, 0);

function toast(m, kind = 'ok') { const t = $('toast'); t.textContent = m; t.dataset.kind = kind; t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 4000); }

function renderNav() {
  const items = [['hoje', 'Hoje', I.home, 0], ...KEYS.map(k => [k, TABS[k].label, TABS[k].icon, data(k).length])];
  $('nav').innerHTML = items.map(([k, l, i, n]) => `<button type="button" data-k="${k}" title="${esc(l)}" aria-label="${esc(l)}" ${k === state.view ? 'aria-current="page"' : ''}>${i}${n ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
  $('nav').querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.k)));
  if (state.view === 'config') $('cfgBtn').setAttribute('aria-current', 'page'); else $('cfgBtn').removeAttribute('aria-current');
  $('seg').hidden = state.view === 'config';
  $('seg').innerHTML = SETORES.map(s => `<button type="button" aria-pressed="${s === state.setor}" data-s="${s}">${s}</button>`).join('');
  $('seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.setor = b.dataset.s; render(); }));
}

function tableHtml(k) {
  const t = TABS[k], rows = data(k);
  if (!rows.length) return `<div class="empty"><b>${term() || state.setor !== 'Todos' ? 'Nada neste filtro.' : 'Nenhuma pendência neste monitor.'}</b><p>${term() || state.setor !== 'Todos' ? 'Ajuste a busca ou o setor.' : 'Tudo em dia na última coleta.'}</p>${term() || state.setor !== 'Todos' ? '<button class="btn btn-sm" data-clear type="button">Limpar filtros</button>' : ''}</div>`;
  return `<div class="tbl-wrap"><table><thead><tr>${t.cols.map(([n, c = '']) => `<th class="${c}">${n}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${t.row(r).map((c, i) => `<td class="${t.cols[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="tbl-foot"><span>${rows.length} de ${R[k].length} itens</span><span>Fonte: dados de exemplo</span></div>`;
}
function blockHtml(k) {
  const t = TABS[k], open = state.open[k];
  return `<section class="blk"><button type="button" class="blk-h" data-blk="${k}" aria-expanded="${open}"><span class="chev">${I.chev}</span><h2>${esc(t.title)}</h2><span class="count">${data(k).length}</span><span class="hint">${esc(t.hint)}</span>${I.info}</button><div class="blk-b" ${open ? '' : 'hidden'}>${tableHtml(k)}</div></section>`;
}

function hojeHtml() {
  const n = total();
  const empresasComPend = new Set(KEYS.filter(k => k !== 'notificacoes').flatMap(k => data(k).map(r => r.cnpj))).size;
  const pct = Math.round(((SAMPLE.totalEmpresas - empresasComPend) / SAMPLE.totalEmpresas) * 100);
  const C = 2 * Math.PI * 52, okLen = C * pct / 100;
  const all = KEYS.flatMap(k => data(k).map(r => ({ k, r })));
  const top = all.sort((a, b) => (TABS[a.k].sev === 's-late' ? 0 : 1) - (TABS[b.k].sev === 's-late' ? 0 : 1))[0];
  const hero = `<div class="card hero"><div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="warn" cx="60" cy="60" r="52" stroke-dasharray="${C}"/><circle class="ok" cx="60" cy="60" r="52" stroke-dasharray="${okLen} ${C}"/></svg><b>${pct}%</b></div>
    <div><span class="eyebrow">Carteira no portal · coleta de exemplo ${new Date(SAMPLE.coletadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    <h2>${n ? `${n} pendências para acompanhar` : 'Tudo em dia'}</h2>
    <p>${SAMPLE.totalEmpresas - empresasComPend} de ${SAMPLE.totalEmpresas} empresas sem pendência de documentos</p>
    ${top ? `<div class="inner"><span class="badge ${TABS[top.k].sev}">Mais urgente</span><b>${esc(TABS[top.k].step(top.r)[0])}</b></div>` : ''}
    <div class="inner"><span>Monitores:</span>${KEYS.map(k => `<span class="chip ${TABS[k].sev.replace('s-', 'c-')}" style="--c:var(--status-${TABS[k].sev.slice(2)})">${esc(TABS[k].label)} <small>${data(k).length}</small></span>`).join('')}</div></div></div>`;
  const steps = all.slice(0, 3).map(({ k, r }) => { const [a, b] = TABS[k].step(r); return `<button type="button" class="step ${TABS[k].sev}" data-go="${k}"><i class="dot"></i><div><b>${esc(a)}</b><small>${esc(b)}</small></div>${I.right}</button>`; }).join('') || '<div class="empty"><b>Nada a acompanhar.</b></div>';
  const recados = SAMPLE.recados.filter(r => state.recados.has(r.id));
  const notes = `<div class="card notes"><h2>${I.info} Recados <span class="count">${recados.length}</span></h2>${recados.map(r => `<div class="note"><div><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p></div><button type="button" data-dismiss="${r.id}" aria-label="Dispensar recado">${I.x}</button></div>`).join('') || '<div class="note"><p>Sem recados.</p></div>'}</div>`;
  const metrics = `<div class="metrics">${KEYS.map(k => `<button type="button" class="metric ${data(k).length ? 'has' : ''}" data-go="${k}"><span>${esc(TABS[k].label)}</span><span class="count">${data(k).length}</span>${I.info}</button>`).join('')}</div>`;
  return `<div class="toolbar"><span class="grow">${n} pendências</span><button class="btn" id="exp" type="button" disabled title="Exportação na Fase 7">Exportar CSV</button></div>
    <div class="grid3">${hero}<div class="card"><h2>Próximos passos <span class="count">${Math.min(3, all.length)}</span></h2>${steps}</div>${notes}</div>${metrics}${KEYS.map(blockHtml).join('')}`;
}

function render() {
  if (state.view === 'config') {
    $('title').textContent = 'Configurações';
    $('sub').textContent = 'Padrões e listas usados nas verificações';
    $('stamp').textContent = `coletado ${new Date(SAMPLE.coletadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    $('view').innerHTML = '<div class="reveal" id="cfgRoot"></div>';
    renderConfig($('cfgRoot'), { toast, onSaved: c => { cfg = structuredClone(c); recompute(); renderNav(); } });
    return renderNav();
  }
  const hoje = state.view === 'hoje';
  $('title').textContent = hoje ? 'Hoje' : TABS[state.view].label;
  $('sub').textContent = hoje ? 'Portal do Cliente · ControlTax' : TABS[state.view].hint;
  $('stamp').textContent = `coletado ${new Date(SAMPLE.coletadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  $('view').innerHTML = `<div class="reveal">${hoje ? hojeHtml() : `<div class="toolbar"><span class="grow">${data(state.view).length} itens</span></div>${blockHtml(state.view)}`}</div>`;
  const v = $('view');
  v.querySelectorAll('[data-go]').forEach(e => e.addEventListener('click', () => go(e.dataset.go)));
  v.querySelectorAll('[data-blk]').forEach(e => e.addEventListener('click', () => { state.open[e.dataset.blk] = !state.open[e.dataset.blk]; render(); }));
  v.querySelectorAll('[data-dismiss]').forEach(e => e.addEventListener('click', () => { state.recados.delete(e.dataset.dismiss); render(); }));
  v.querySelectorAll('[data-clear]').forEach(e => e.addEventListener('click', () => { $('search').value = ''; state.setor = 'Todos'; render(); }));
  renderNav();
}
function go(k) { state.view = k; render(); window.scrollTo(0, 0); }

$('search').addEventListener('input', () => { if (state.view !== 'config') render(); });
$('cfgBtn').addEventListener('click', () => go('config'));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search').focus(); } });
$('bell').addEventListener('click', () => toast('Sem alertas novos'));
$('refresh').addEventListener('click', () => toast('Coleta real disponível na Fase 4'));
$('themeBtn').addEventListener('click', () => {
  const el = document.documentElement, cur = el.getAttribute('data-theme');
  const next = (cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches)) ? 'light' : 'dark';
  el.setAttribute('data-theme', next);
  try { localStorage.setItem('controlhub-theme', next); } catch (e) { /* sem storage */ }
  toast(next === 'dark' ? 'Tema escuro ativado' : 'Tema claro ativado');
});

$('view').innerHTML = '<div class="sk-list"><div class="sk" style="width:60%"></div><div class="sk" style="width:90%"></div><div class="sk" style="width:75%"></div></div>';
renderNav();
loadConfig().then(c => { cfg = c; recompute(); setTimeout(render, 300); });
