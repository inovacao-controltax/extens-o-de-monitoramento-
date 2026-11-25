import { SAMPLE } from '../src/mock.js';
import { loadConfig, formatCnpj } from '../src/config.js';
import { analyze } from '../src/rules.js';
import { renderConfig } from './config-view.js';
import { renderColeta } from './coleta-view.js';
import { loadSnapshot } from '../src/snapshot.js';

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
  sync: ic('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>'),
  chev: ic('<path d="M6 9l6 6 6-6"/>'),
  right: ic('<path d="M9 6l6 6-6 6"/>'),
  info: ic('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
};
$('themeBtn').innerHTML = I.moon;
$('bell').innerHTML = I.bell;
$('fechar').innerHTML = I.x;
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
    hint: 'Têm tarefas ativas e não recebem aviso de tarefa nova', setores: r => String(r.setor || '').split(', ').filter(Boolean),
    cols: [['Funcionário'], ['Setor'], ['E-mail', 'col-sec'], ['Tarefas ativas', 'num r']],
    row: r => [`<span class="emp">${esc(r.nome)}</span>`, String(r.setor || '').split(', ').filter(Boolean).map(sector).join('') || '<span class="muted">—</span>', esc(r.email), r.tarefasAtivas ?? '—'],
    step: r => [`Notificação desativada · ${r.nome}`, `${r.tarefasAtivas} tarefas ativas sem aviso`] },
};
const KEYS = Object.keys(TABS);

let cfg = null, snap = null, gsnap = null, gestado = null, andamento = null, R = { nomenclatura: [], pastas: [], semEnvio: [], notificacoes: [] };
const VELHO_H = 6, LIM = 200;   // linhas por tabela de cada vez (a leitura pode trazer milhares)
const real = () => (snap && snap.fonte === 'onvio' ? snap : null);
const lendoSemDados = () => !real() && !!andamento && andamento.estado === 'rodando';   // lendo, ainda sem nenhuma empresa: nunca mostrar os números de exemplo
const source = () => (real() ? { docs: real().docs, users: (gsnap && gsnap.users) || [], trained: [] } : gsnap ? { docs: [], users: gsnap.users, trained: [] } : lendoSemDados() ? { docs: [], users: [], trained: [] } : SAMPLE);   // Gestta (usuários) entra na Fase 5
const recompute = () => { R = analyze(source(), cfg); marcarIcone(); };
// Número de pendências no ícone da extensão (só com dados reais)
function marcarIcone() {
  try { const n = real() ? Object.values(R).reduce((s, l) => s + l.length, 0) : 0; chrome.action.setBadgeText({ text: n ? String(n) : '' }); chrome.action.setBadgeBackgroundColor({ color: '#C2000C' }); } catch (e) { /* fora da extensão */ }
}
const universo = () => (real() ? Math.max(1, real().qualidade.lidas || 0) : lendoSemDados() ? 1 : SAMPLE.totalEmpresas);
const coletadoEm = () => (real() ? Math.max(real().coletadoEm, real().rapidaEm || 0) : SAMPLE.coletadoEm);
const fonteNome = () => (!real() && gsnap && !lendoSemDados() ? 'Dados do Gestta' : real() ? (real().lendo ? 'Lendo o Onvio ao vivo' : 'Dados do Onvio') : lendoSemDados() ? 'Lendo o Onvio…' : 'Dados de exemplo');
const hora = () => new Date(coletadoEm()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function recadoAndamento() {
  if (!andamento) return [];
  if (andamento.estado === 'rodando') return [{ id: 'lendo', titulo: 'Lendo o Onvio agora', texto: `${andamento.msg || 'Em andamento'}. Pode usar o Onvio normalmente; os números atualizam sozinhos.` }];
  if (andamento.estado === 'sem_sessao') return [{ id: 'semsessao', titulo: 'Leitura automática parada', texto: `${andamento.msg}. Entre no Onvio com o usuário do escritório; tenta de novo em até 30 min.` }];
  if (andamento.estado === 'erro') return [{ id: 'erroleitura', titulo: 'A leitura automática falhou', texto: `${andamento.msg}. Abra Coleta do Onvio e use "Testar leitura" para ver o motivo.` }];
  return [];
}
function recadosAtuais() {
  return [...recadoAndamento(), ...recadosBase()];
}
function recadosBase() {
  if (!real()) return lendoSemDados() ? [] : SAMPLE.recados;
  const q = real().qualidade, out = [];
  const horas = Math.floor((Date.now() - real().coletadoEm) / 36e5);
  if (horas >= VELHO_H) out.push({ id: 'velho', titulo: `Dados de ${horas} h atrás`, texto: 'Clique em "Coletar do Onvio" para atualizar.' });
  if (real().parcial && !real().lendo) out.push({ id: 'parcial', titulo: 'Coleta parcial', texto: `Foram lidas ${q.lidas} de ${real().totalEmpresas} empresas ativas. Os números valem só para elas. Rode "Coletar agora" com 0 para ler todas.` });
  if (q.docs && q.origemIndefinida === q.docs) out.push({ id: 'origem', titulo: 'Autor do arquivo não identificado', texto: 'Não deu para saber quem enviou cada arquivo, então nomenclatura e "treinados sem envio" ficam vazios. Rode "Testar leitura" e envie o relatório.' });
  if (q.semCnpj) out.push({ id: 'cnpj', titulo: `${q.semCnpj} empresa(s) sem CNPJ`, texto: 'Sem CNPJ elas não casam com a lista de treinados do Hub.' });
  if (!cfg.trained.length) out.push({ id: 'treinados', titulo: 'Lista de treinados vazia', texto: 'Cadastre os clientes treinados em Configurações para ativar "Treinados sem envio".' });
  if (!gsnap) out.push({ id: 'gestta', titulo: 'Notificações ainda não lidas', texto: gestado && gestado.estado === 'sem_acesso' ? gestado.msg : 'Abra o Gestta logado como gestor ou administrador: a leitura dos funcionários é automática.' });
  else if (!gsnap.campo) out.push({ id: 'gcampo', titulo: 'Campo da notificação não identificado', texto: 'O Gestta foi lido, mas a extensão não achou onde fica o aviso de tarefa nova. Veja Coleta do Onvio › Gestta.' });
  return out;
}
const state = { lim: {}, view: 'hoje', setor: 'Todos', open: Object.fromEntries(KEYS.map(k => [k, true])), dispensados: new Set() };
const term = () => $('search').value.trim().toLowerCase();
const data = k => R[k].filter(r => {
  const s = TABS[k].setores(r).filter(Boolean);
  if (state.setor !== 'Todos' && s.length && !s.includes(state.setor)) return false;
  if (state.setor !== 'Todos' && !s.length) return false;
  return !term() || Object.values(r).join(' ').toLowerCase().includes(term());
});
const total = () => KEYS.reduce((n, k) => n + data(k).length, 0);

function toast(m, kind = 'ok') { const t = $('toast'); t.textContent = m; t.dataset.kind = kind; t.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 4000); }

let navAnt = '', segAnt = '', htmlAnt = '', vistaAnt = '';
function atualizarPill() {
  const pill = document.querySelector('.pill-status'), fill = $('ringFill');
  const rod = !!andamento && andamento.estado === 'rodando';
  const lendoSnap = !!real() && !!real().lendo && !rod;
  let pct = 0, linha = `coletado ${hora()}`, indet = false;
  if (rod) {
    const f = andamento.feito || 0, t = andamento.total || 0;
    if (t > 0) { pct = Math.round((f / t) * 100); linha = andamento.rapida ? `treinadas ${f}/${t}` : `${f} de ${t} · ${pct}%`; }
    else { indet = true; linha = 'lendo a lista…'; }
  } else if (lendoSnap) { const q = real().qualidade; pct = q.empresas ? Math.round((q.lidas / q.empresas) * 100) : 0; linha = `${q.lidas} de ${q.empresas} · ${pct}%`; }
  else if (real()) pct = 100;
  pill.classList.toggle('lendo', rod || lendoSnap); pill.classList.toggle('indet', indet);
  fill.style.strokeDashoffset = String(indet ? 75 : 100 - pct);
  $('fonteNome').textContent = fonteNome(); $('stamp').textContent = linha;
  pill.title = rod ? (andamento.msg || '') : '';
}
function renderNav() {
  const items = [['hoje', 'Hoje', I.home, 0], ...KEYS.map(k => [k, TABS[k].label, TABS[k].icon, data(k).length]), ['coleta', 'Coleta do Onvio', I.sync, 0]];
  const navHtml = items.map(([k, l, i, n]) => `<button type="button" data-k="${k}" title="${esc(l)}" aria-label="${esc(l)}" ${k === state.view ? 'aria-current="page"' : ''}>${i}${n ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
  if (navHtml !== navAnt) { navAnt = navHtml; $('nav').innerHTML = navHtml; $('nav').querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.k))); }
  if (state.view === 'config') $('cfgBtn').setAttribute('aria-current', 'page'); else $('cfgBtn').removeAttribute('aria-current');
  $('seg').hidden = state.view === 'config' || state.view === 'coleta';
  const segHtml = SETORES.map(s => `<button type="button" aria-pressed="${s === state.setor}" data-s="${s}">${s}</button>`).join('');
  if (segHtml !== segAnt) { segAnt = segHtml; $('seg').innerHTML = segHtml; $('seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.setor = b.dataset.s; render(); })); }
}

function tableHtml(k) {
  const t = TABS[k], rows = data(k);
  if (lendoSemDados()) return '<div class="empty"><b>Lendo o Onvio…</b><p>Os resultados aparecem aqui assim que as primeiras empresas forem lidas.</p></div>';
  if (!rows.length && real() && k === 'notificacoes') {
    if (!gsnap) return `<div class="empty"><b>Ainda não lido do Gestta.</b><p>${gestado && gestado.estado === 'sem_acesso' ? esc(gestado.msg) : 'Abra o Gestta (logado como gestor ou administrador): a leitura é automática.'}</p></div>`;
    if (!gsnap.campo) return '<div class="empty"><b>Campo da notificação não identificado.</b><p>Em Coleta do Onvio › Gestta, use "Testar leitura do Gestta" ou "Aprender chamadas" para a extensão achar onde o Gestta guarda esse aviso.</p></div>';
  }
  if (!rows.length && real() && k === 'semEnvio' && !cfg.trained.length) return '<div class="empty"><b>Lista de treinados vazia.</b><p>Cadastre os clientes treinados em Configurações.</p></div>';
  if (!rows.length) return `<div class="empty"><b>${term() || state.setor !== 'Todos' ? 'Nada neste filtro.' : 'Nenhuma pendência neste monitor.'}</b><p>${term() || state.setor !== 'Todos' ? 'Ajuste a busca ou o setor.' : 'Tudo em dia na última coleta.'}</p>${term() || state.setor !== 'Todos' ? '<button class="btn btn-sm" data-clear type="button">Limpar filtros</button>' : ''}</div>`;
  return `<div class="tbl-wrap"><table><thead><tr>${t.cols.map(([n, c = '']) => `<th class="${c}">${n}</th>`).join('')}</tr></thead><tbody>${
    rows.slice(0, state.lim[k] || LIM).map(r => `<tr>${t.row(r).map((c, i) => `<td class="${t.cols[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="tbl-foot"><span>${Math.min(rows.length, state.lim[k] || LIM)} de ${rows.length} itens${rows.length > (state.lim[k] || LIM) ? ` · <button class="btn btn-sm" data-mais="${k}" type="button">Mostrar mais ${LIM}</button>` : ''}</span><span>Fonte: ${k === 'notificacoes' ? 'Gestta' : fonteNome().toLowerCase()}</span></div>`;
}
function blockHtml(k) {
  const t = TABS[k], open = state.open[k];
  return `<section class="blk"><button type="button" class="blk-h" data-blk="${k}" aria-expanded="${open}"><span class="chev">${I.chev}</span><h2>${esc(t.title)}</h2><span class="count">${data(k).length}</span><span class="hint">${esc(t.hint)}</span>${I.info}</button><div class="blk-b" ${open ? '' : 'hidden'}>${tableHtml(k)}</div></section>`;
}

function hojeHtml() {
  const n = total();
  const empresasComPend = new Set(KEYS.filter(k => k !== 'notificacoes').flatMap(k => data(k).map(r => r.cnpj))).size;
  const pct = Math.max(0, Math.round(((universo() - empresasComPend) / universo()) * 100));
  const C = 2 * Math.PI * 52, okLen = C * pct / 100;
  const all = KEYS.flatMap(k => data(k).map(r => ({ k, r })));
  const top = all.sort((a, b) => (TABS[a.k].sev === 's-late' ? 0 : 1) - (TABS[b.k].sev === 's-late' ? 0 : 1))[0];
  const semLeitura = lendoSemDados() || (!!real() && !(real().qualidade.lidas > 0) && !real().lendo);
  const hero = `<div class="card hero"><div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="warn" cx="60" cy="60" r="52" stroke-dasharray="${C}"/><circle class="ok" cx="60" cy="60" r="52" stroke-dasharray="${okLen} ${C}"/></svg><b>${semLeitura ? '—' : pct + '%'}</b></div>
    <div><span class="eyebrow">Carteira no portal · ${real() ? (real().lendo ? 'lendo ao vivo' : 'coleta do Onvio') : lendoSemDados() ? 'lendo agora' : 'coleta de exemplo'} ${hora()}</span>
    <h2>${semLeitura ? (lendoSemDados() ? 'Lendo o Onvio…' : 'Nada foi lido ainda') : n ? `${n} pendências para acompanhar` : 'Tudo em dia'}</h2>
    <p>${semLeitura ? (lendoSemDados() ? 'Os resultados aparecem aqui assim que as primeiras empresas forem lidas.' : 'A leitura do Onvio não trouxe nenhuma empresa. Veja o andamento em Coleta do Onvio.') : `${Math.max(0, universo() - empresasComPend)} de ${universo()} empresas sem pendência de documentos`}</p>
    ${top ? `<div class="inner"><span class="badge ${TABS[top.k].sev}">Mais urgente</span><b>${esc(TABS[top.k].step(top.r)[0])}</b></div>` : ''}
    <div class="inner"><span>Monitores:</span>${KEYS.map(k => `<span class="chip ${TABS[k].sev.replace('s-', 'c-')}" style="--c:var(--status-${TABS[k].sev.slice(2)})">${esc(TABS[k].label)} <small>${data(k).length}</small></span>`).join('')}</div></div></div>`;
  const steps = all.slice(0, 3).map(({ k, r }) => { const [a, b] = TABS[k].step(r); return `<button type="button" class="step ${TABS[k].sev}" data-go="${k}"><i class="dot"></i><div><b>${esc(a)}</b><small>${esc(b)}</small></div>${I.right}</button>`; }).join('') || '<div class="empty"><b>Nada a acompanhar.</b></div>';
  const recados = recadosAtuais().filter(r => !state.dispensados.has(r.id));
  const notes = `<div class="card notes"><h2>${I.info} Recados <span class="count">${recados.length}</span></h2>${recados.map(r => `<div class="note"><div><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p></div><button type="button" data-dismiss="${r.id}" aria-label="Dispensar recado">${I.x}</button></div>`).join('') || '<div class="note"><p>Sem recados.</p></div>'}</div>`;
  const metrics = `<div class="metrics">${KEYS.map(k => `<button type="button" class="metric ${data(k).length ? 'has' : ''}" data-go="${k}"><span>${esc(TABS[k].label)}</span><span class="count">${data(k).length}</span>${I.info}</button>`).join('')}</div>`;
  return `<div class="toolbar"><span class="grow">${n} pendências</span><button class="btn" id="exp" type="button" disabled title="Exportação na Fase 7">Exportar CSV</button></div>
    <div class="grid3">${hero}<div class="card"><h2>Próximos passos <span class="count">${Math.min(3, all.length)}</span></h2>${steps}</div>${notes}</div>${metrics}${KEYS.map(blockHtml).join('')}`;
}

function render(animar = false) {
  if (state.view === 'config') {
    $('title').textContent = 'Configurações';
    $('sub').textContent = 'Padrões e listas usados nas verificações';
    atualizarPill(); htmlAnt = ''; vistaAnt = 'config';
    $('view').innerHTML = '<div class="reveal" id="cfgRoot"></div>';
    renderConfig($('cfgRoot'), { toast, onSaved: c => { cfg = structuredClone(c); recompute(); renderNav(); } });
    return renderNav();
  }
  if (state.view === 'coleta') {
    $('title').textContent = 'Coleta do Onvio';
    $('sub').textContent = 'Leitura do portal pela sua sessão, só leitura';
    atualizarPill(); htmlAnt = ''; vistaAnt = 'coleta';
    $('view').innerHTML = '<div class="reveal" id="coletaRoot"></div>';
    renderColeta($('coletaRoot'), { toast, onChanged: async () => { snap = await loadSnapshot(); recompute(); renderNav(); atualizarPill(); } });
    return renderNav();
  }
  const hoje = state.view === 'hoje';
  $('title').textContent = hoje ? 'Hoje' : TABS[state.view].label;
  $('sub').textContent = hoje ? 'Portal do Cliente · ControlTax' : TABS[state.view].hint;
  atualizarPill();
  const html = hoje ? hojeHtml() : `<div class="toolbar"><span class="grow">${data(state.view).length} itens</span></div>${blockHtml(state.view)}`;
  // Atualização automática (leitura ao vivo): sem animação, sem perder a rolagem e sem refazer o que não mudou.
  if (!animar && html === htmlAnt && vistaAnt === state.view) return renderNav();
  const y = window.scrollY;
  htmlAnt = html; vistaAnt = state.view;
  $('view').innerHTML = `<div class="${animar ? 'reveal' : ''}">${html}</div>`;
  if (!animar) window.scrollTo(0, y);
  const v = $('view');
  v.querySelectorAll('[data-mais]').forEach(e => e.addEventListener('click', () => { state.lim[e.dataset.mais] = (state.lim[e.dataset.mais] || LIM) + LIM; render(false); }));
  v.querySelectorAll('[data-go]').forEach(e => e.addEventListener('click', () => go(e.dataset.go)));
  v.querySelectorAll('[data-blk]').forEach(e => e.addEventListener('click', () => { state.open[e.dataset.blk] = !state.open[e.dataset.blk]; render(); }));
  v.querySelectorAll('[data-dismiss]').forEach(e => e.addEventListener('click', () => { state.dispensados.add(e.dataset.dismiss); render(); }));
  v.querySelectorAll('[data-clear]').forEach(e => e.addEventListener('click', () => { $('search').value = ''; state.setor = 'Todos'; render(); }));
  renderNav();
}
function go(k) { state.view = k; render(true); window.scrollTo(0, 0); }

$('search').addEventListener('input', () => { if (state.view !== 'config' && state.view !== 'coleta') render(); });
$('cfgBtn').addEventListener('click', () => go('config'));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search').focus(); } });
$('bell').addEventListener('click', () => toast('Sem alertas novos'));
$('refresh').addEventListener('click', () => go('coleta'));
$('themeBtn').addEventListener('click', () => {
  const el = document.documentElement, cur = el.getAttribute('data-theme');
  const next = (cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches)) ? 'light' : 'dark';
  el.setAttribute('data-theme', next);
  try { localStorage.setItem('controlhub-theme', next); } catch (e) { /* sem storage */ }
  toast(next === 'dark' ? 'Tema escuro ativado' : 'Tema claro ativado');
});

$('view').innerHTML = '<div class="sk-list"><div class="sk" style="width:60%"></div><div class="sk" style="width:90%"></div><div class="sk" style="width:75%"></div></div>';
renderNav();
// Por cima do Onvio (?camada=1): botão fechar, Esc e, se a pessoa ligou, coleta sozinha quando os dados estão velhos.
const camada = new URLSearchParams(location.search).get('camada') === '1';
if (camada) {
  document.documentElement.dataset.camada = '1';
  $('fechar').hidden = false;
  const fechar = () => parent.postMessage({ tipo: 'controlmon-fechar' }, '*');
  $('fechar').addEventListener('click', fechar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('overlay').classList.contains('open')) fechar(); });
}
Promise.all([loadConfig(), loadSnapshot()]).then(([c, sn]) => {
  cfg = c; snap = sn; recompute(); setTimeout(() => render(true), 300);
});

// A leitura automática grava a coleta e o andamento no armazenamento: o painel acompanha sozinho, sem clique.
let aguardandoRender = false, ultimoRender = 0;
function renderSuave() {
  if (state.view === 'coleta' || state.view === 'config') return renderNav();
  const falta = 1500 - (Date.now() - ultimoRender);
  if (falta > 0) { if (!aguardandoRender) { aguardandoRender = true; setTimeout(() => { aguardandoRender = false; renderSuave(); }, falta); } return; }
  ultimoRender = Date.now(); render(false);
}
try {
  chrome.storage.onChanged.addListener(async (ch, area) => {
    if (area !== 'local') return;
    if (ch['monitor-coleta-estado']) andamento = ch['monitor-coleta-estado'].newValue || null;
    if (ch['monitor-gestta']) gsnap = ch['monitor-gestta'].newValue || null;
    if (ch['monitor-gestta-estado']) gestado = ch['monitor-gestta-estado'].newValue || null;
    if (ch['monitor-snapshot']) { snap = await loadSnapshot(); }
    if (ch['monitor-snapshot'] || ch['monitor-coleta-estado'] || ch['monitor-gestta'] || ch['monitor-gestta-estado']) { recompute(); atualizarPill(); renderSuave(); }
  });
  chrome.storage.local.get(['monitor-gestta', 'monitor-gestta-estado']).then(r => { gsnap = r['monitor-gestta'] || null; gestado = r['monitor-gestta-estado'] || null; recompute(); renderSuave(); });
  chrome.storage.local.get('monitor-coleta-estado').then(r => { andamento = r['monitor-coleta-estado'] || null; if (andamento) { recompute(); renderSuave(); } });
} catch (e) { /* fora da extensão */ }
