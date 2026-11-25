import { MOCK } from '../src/mock.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';
const secClass = s => ({ 'Pessoal': 'sec-pessoal', 'Contábil': 'sec-contabil', 'Fiscal': 'sec-fiscal', 'Financeiro': 'sec-financeiro' }[s] || 'sec-outro');
const sector = s => `<span class="sector ${secClass(s)}">${esc(s)}</span>`;
const badge = (txt, cls) => `<span class="badge ${cls}">${esc(txt)}</span>`;
const icon = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

// html: true => a função devolve HTML já seguro (montado com esc()).
const TABS = {
  nomenclatura: { label: 'Nomenclatura', icon: icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    title: 'Arquivos com nome fora do padrão',
    sub: 'Documentos enviados pelo cliente cujo nome não segue o padrão.',
    cols: [['Empresa'], ['CNPJ', 'num'], ['Setor', 'col-sec'], ['Pasta', 'col-sec'], ['Arquivo'], ['Enviado em', 'num r']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(r.cnpj), sector(r.setor), esc(r.pasta), esc(r.arquivo), fmt(r.data)] },
  pastas: { label: 'Pastas fora do padrão', icon: icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    title: 'Empresas com pasta fora do padrão',
    sub: 'Pastas de primeiro nível que não fazem parte da estrutura oficial.',
    cols: [['Empresa'], ['CNPJ', 'num'], ['Pasta encontrada'], ['Arquivos', 'num r']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(r.cnpj), esc(r.pasta), r.arquivos] },
  semEnvio: { label: 'Treinados sem envio', icon: icon('<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>'),
    title: 'Clientes treinados que não estão enviando',
    sub: 'Clientes já treinados e com demanda, sem envio recente no portal.',
    cols: [['Empresa'], ['CNPJ', 'num'], ['Treinado em', 'num col-sec'], ['Demanda'], ['Situação']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(r.cnpj), fmt(r.treinadoEm), r.demanda.map(sector).join(''),
      r.dias === null ? badge('Nunca enviou', 's-late') : badge(`${r.dias} dias sem envio`, 's-warn')] },
  notificacoes: { label: 'Notificações', icon: icon('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/>'),
    title: 'Funcionários com notificação de tarefa desativada',
    sub: 'Quem tem tarefas ativas mas não recebe aviso quando chega tarefa nova.',
    cols: [['Funcionário'], ['Setor'], ['E-mail', 'col-sec'], ['Tarefas ativas', 'num r']],
    row: r => [`<span class="emp">${esc(r.nome)}</span>`, sector(r.setor), esc(r.email), r.tarefasAtivas] },
};
const HOME_ICON = icon('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>');

let current = 'geral';
const term = () => $('search').value.trim().toLowerCase();
const filtered = k => MOCK[k].filter(r => !term() || Object.values(r).join(' ').toLowerCase().includes(term()));

function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 4000); }

function renderNav() {
  const items = [['geral', 'Visão geral', HOME_ICON, 0], ...Object.entries(TABS).map(([k, t]) => [k, t.label, t.icon, MOCK[k].length])];
  $('nav').innerHTML = items.map(([k, l, ic, n]) =>
    `<button type="button" data-k="${k}" ${k === current ? 'aria-current="page"' : ''}>${ic}<span class="lbl">${esc(l)}</span>${n ? `<span class="cnt lbl">${n}</span>` : ''}</button>`).join('');
  $('nav').querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.k)));
}

function viewGeral() {
  const total = Object.keys(TABS).reduce((s, k) => s + MOCK[k].length, 0);
  $('sub').textContent = `${total} pendências em 4 monitores · dados de exemplo, coletados em ${new Date(MOCK.coletadoEm).toLocaleString('pt-BR')}`;
  return `<div class="kpis">${Object.entries(TABS).map(([k, t]) => {
    const n = MOCK[k].length;
    return `<button type="button" class="kpi" data-go="${k}"><span class="n">${n}</span><span class="t">${esc(t.title)}</span>${n ? badge('Precisa de atenção', 's-warn') : badge('Em dia', 's-ok')}</button>`;
  }).join('')}</div>`;
}

function viewTable(k) {
  const t = TABS[k], rows = filtered(k);
  $('sub').textContent = t.sub;
  if (!rows.length) return `<div class="empty"><b>${term() ? 'Nenhum resultado para essa busca.' : 'Nenhuma pendência neste monitor.'}</b><p>${term() ? 'Confira o nome ou o CNPJ digitado.' : 'Tudo em dia na última coleta.'}</p>${term() ? '<button class="btn" id="clear" type="button">Limpar busca</button>' : ''}</div>`;
  const head = t.cols.map(([n, c = '']) => `<th class="${c}">${n}</th>`).join('');
  const body = rows.map(r => `<tr>${t.row(r).map((c, i) => `<td class="${t.cols[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><div class="tbl-foot"><span>${rows.length} de ${MOCK[k].length} itens</span><span>Fonte: dados de exemplo</span></div></div>`;
}

function render() {
  $('title').textContent = current === 'geral' ? 'Visão geral' : TABS[current].title;
  $('view').innerHTML = `<div class="reveal">${current === 'geral' ? viewGeral() : viewTable(current)}</div>`;
  $('view').querySelectorAll('[data-go]').forEach(c => c.addEventListener('click', () => go(c.dataset.go)));
  $('clear')?.addEventListener('click', () => { $('search').value = ''; render(); });
  renderNav();
}
function go(k) { current = k; $('rail').classList.remove('open'); render(); }

$('search').addEventListener('input', () => { if (current === 'geral') go(Object.keys(TABS)[0]); else render(); });
$('menuBtn').addEventListener('click', () => $('rail').classList.toggle('open'));
$('themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('controlhub-theme', next); } catch (e) { /* sem storage */ }
  toast(next === 'dark' ? 'Tema escuro ativado' : 'Tema claro ativado');
});
$('refresh').addEventListener('click', () => toast('Coleta real disponível na Fase 4'));

// Skeleton curto na entrada (padrão de carregamento do DESIGN.md)
$('view').innerHTML = '<div class="sk-list"><div class="sk" style="width:60%"></div><div class="sk" style="width:90%"></div><div class="sk" style="width:75%"></div></div>';
renderNav();
setTimeout(render, 300);
