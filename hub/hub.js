import { SAMPLE } from '../src/mock.js';
import { loadConfig, saveConfig, formatCnpj } from '../src/config.js';
import { puxarTreinados, contatosDoHub } from '../src/hub-treinados.js';
import { montarAviso, linkZimbra, destinatarios } from '../src/aviso.js';
import { analyze, checkNotificacoesOnvio, silenciadaAgora, statusEnvio, raizDoCnpj } from '../src/rules.js';
import { renderConfig } from './config-view.js';
import { renderColeta } from './coleta-view.js';
import { loadSnapshot, loadSnapshotCompleto, snapshotEstavel } from '../src/snapshot.js';
import { CHAVE_HIST, naoVistas, marcarVistas, evolucao, paraCsv } from '../src/historico.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';
const ic = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  list: ic('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
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
const sino = () => { const n = naoVistas(hist).length; $('bell').innerHTML = I.bell + (n ? `<span class="cnt" style="position:absolute;top:-4px;right:-4px">${n > 99 ? '99+' : n}</span>` : ''); $('bell').style.position = 'relative'; $('bell').setAttribute('aria-label', n ? `Alertas: ${n} novas` : 'Alertas'); };
$('bell').innerHTML = I.bell;
$('fechar').innerHTML = I.x;
$('cfgBtn').innerHTML = I.gear;

const secClass = s => ({ 'Pessoal': 'sec-pessoal', 'Contábil': 'sec-contabil', 'Fiscal': 'sec-fiscal', 'Financeiro': 'sec-financeiro' }[s] || 'sec-outro');
const sector = s => `<span class="sector ${secClass(s)}">${esc(s)}</span>`;
const badge = (t, c) => `<span class="badge ${c}">${esc(t)}</span>`;
const SETORES = ['Todos', 'Pessoal', 'Fiscal', 'Contábil'];

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
    cols: [['Empresa'], ['CNPJ', 'num'], ['Treinado em', 'num col-sec'], ['Demanda'], ['Último envio', 'col-sec'], ['Situação'], ['', 'r']],
    row: r => [`<span class="emp">${esc(r.empresa)}</span>`, esc(formatCnpj(r.cnpj)), fmt(r.treinadoEm), r.demanda.map(sector).join(''),
      r.dias === null ? '<span class="muted">nenhum registrado</span>' : `há ${r.dias} dias <span class="muted">· ${esc(r.fonte || 'arquivo')}</span>`,
      r.dias === null ? badge('Nenhum envio registrado', 's-late') : badge(`${r.dias} dias sem envio`, 's-warn'),
      `<span style="display:inline-flex;gap:6px;align-items:center">${(cfg.avisados || {})[r.cnpj] ? `<small class="muted" title="Dia em que o rascunho do aviso foi aberto">aviso em ${fmt(cfg.avisados[r.cnpj])}</small>` : ''}<button type="button" class="btn btn-sm" data-avisar="${esc(r.cnpj)}" title="Prepara o e-mail para o cliente no Zimbra (você confere e envia)">Avisar</button><button type="button" class="btn btn-sm" data-sil="${esc(r.cnpj)}" title="Não acompanhar esta empresa por um tempo (sem movimento, férias coletivas…)">Silenciar</button></span>`],
    step: r => [`Sem envio no portal · ${r.empresa}`, r.dias === null ? 'Treinado e sem nenhum uso do portal registrado' : `Última atividade do cliente há ${r.dias} dias (${r.fonte || 'arquivo'})`] },
  notificacoes: { label: 'Notificações', icon: I.bellOff, sev: 's-soon', title: 'Funcionários com notificação desativada',
    hint: 'Alguém desmarcou "Via e-mail" e "Via sistema" em "A cada nova Solicitação de Serviço"', setores: r => String(r.setor || '').split(', ').filter(Boolean),
    cols: [['Funcionário'], ['Nova solicitação'], ['Situação']],
    row: r => r.motivo ? [`<span class="emp">${esc(r.nome)}</span>`, 'E-mail e sistema', badge(r.situacao === 'padrao' ? 'Sem configuração salva' : 'Desligado', r.situacao === 'padrao' ? 's-warn' : 's-late')]
      : [`<span class="emp">${esc(r.nome)}</span>`, 'Aviso de tarefa nova', badge('Desligado', 's-late')],
    step: r => [`Notificação desativada · ${r.nome}`, r.motivo || 'Sem aviso de tarefa nova'] },
};
const KEYS = Object.keys(TABS);

let cfg = null, snap = null, gsnap = null, nsnap = null, nestado = null, ssnap = null, hist = null, snapCompleto = null, snapEst = null, gestado = null, andamento = null, R = { nomenclatura: [], pastas: [], semEnvio: [], notificacoes: [] };
const VELHO_H = 6, LIM = 200;   // linhas por tabela de cada vez (a leitura pode trazer milhares)
const real = () => snapEst;      // a coleta estável: a terminada ou, enquanto a nova é lida, a última completa (os números não sobem e descem)
const lendoSemDados = () => !real() && !!andamento && andamento.estado === 'rodando';   // lendo, ainda sem nenhuma empresa: nunca mostrar os números de exemplo
const source = () => (real() ? { docs: real().docs, notif: nsnap, solic: ssnap && ssnap.porCnpj, users: (gsnap && gsnap.users) || [], trained: [] } : gsnap ? { docs: [], users: gsnap.users, trained: [] } : lendoSemDados() ? { docs: [], users: [], trained: [] } : SAMPLE);   // Gestta (usuários) entra na Fase 5
const recompute = () => { snapEst = snapshotEstavel(snap, snapCompleto); R = analyze(source(), cfg); if (nsnap) R.notificacoes = checkNotificacoesOnvio(nsnap, cfg); marcarIcone(); };   // notificações lidas do Onvio valem mesmo sem a coleta das empresas
// Número de pendências no ícone da extensão (só com dados reais)
function marcarIcone() {
  try { const n = real() ? Object.values(R).reduce((s, l) => s + l.length, 0) : 0; chrome.action.setBadgeText({ text: n ? String(n) : '' }); chrome.action.setBadgeBackgroundColor({ color: '#C2000C' }); } catch (e) { /* fora da extensão */ }
}
const universo = () => (real() ? Math.max(1, real().qualidade.lidas || 0) : lendoSemDados() ? 1 : SAMPLE.totalEmpresas);
const coletadoEm = () => (real() ? Math.max(real().coletadoEm, real().rapidaEm || 0) : SAMPLE.coletadoEm);
const fonteNome = () => (!real() && gsnap && !lendoSemDados() ? 'Dados do Gestta' : real() ? (real().lendo ? 'Lendo o Onvio ao vivo' : 'Dados do Onvio') : lendoSemDados() ? 'Lendo o Onvio…' : 'Dados de exemplo');
const hora = () => new Date(coletadoEm()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function recadoAndamento() {
  if (!andamento) return real() ? [] : [{ id: 'semleitura', titulo: 'A extensão ainda não leu o Onvio neste navegador', texto: 'Abra o Onvio (Portal do Cliente, visão do escritório) e recarregue a página (F5): a leitura começa sozinha. Depois de atualizar a extensão, recarregue também as abas do Onvio já abertas.' }];
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
  if (!nsnap) out.push({ id: 'notif', titulo: 'Notificações ainda não lidas', texto: 'A leitura das notificações da equipe é automática com o Onvio aberto.' });
  else if (nsnap.itens.length && nsnap.itens.every(u => u.estado === 'padrao')) out.push({ id: 'notifpadrao', titulo: 'Notificações: nenhum funcionário com configuração salva', texto: 'Nenhum funcionário teve a configuração alterada. No Onvio eles aparecem desmarcados: marque a opção em Coleta para listá-los.' });
  return out;
}
const state = { lim: {}, view: 'hoje', setor: 'Todos', open: Object.fromEntries(KEYS.map(k => [k, true])), dispensados: new Set() };
const term = () => $('search').value.trim().toLowerCase();
const data = k => R[k].filter(r => {
  const s = TABS[k].setores(r).filter(Boolean);
  if (k !== 'notificacoes') {   // a equipe do escritório não tem setor no Onvio: o filtro de setor não vale aqui
    if (state.setor !== 'Todos' && s.length && !s.includes(state.setor)) return false;
    if (state.setor !== 'Todos' && !s.length) return false;
  }
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
  const items = [['hoje', 'Hoje', I.home, 0], ...KEYS.map(k => [k, TABS[k].label, TABS[k].icon, data(k).length]), ['envios', 'Últimos envios', I.list, 0], ['coleta', 'Coleta do Onvio', I.sync, 0]];
  const navHtml = items.map(([k, l, i, n]) => `<button type="button" data-k="${k}" title="${esc(l)}" aria-label="${esc(l)}" ${k === state.view ? 'aria-current="page"' : ''}>${i}${n ? `<span class="cnt">${n}</span>` : ''}</button>`).join('');
  if (navHtml !== navAnt) { navAnt = navHtml; $('nav').innerHTML = navHtml; $('nav').querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(b.dataset.k))); }
  if (state.view === 'config') $('cfgBtn').setAttribute('aria-current', 'page'); else $('cfgBtn').removeAttribute('aria-current');
  $('seg').hidden = state.view === 'config' || state.view === 'coleta' || state.view === 'envios';
  const segHtml = SETORES.map(s => `<button type="button" aria-pressed="${s === state.setor}" data-s="${s}">${s}</button>`).join('');
  if (segHtml !== segAnt) { segAnt = segHtml; $('seg').innerHTML = segHtml; $('seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.setor = b.dataset.s; render(); })); }
}

function tableHtml(k) {
  const t = TABS[k], rows = data(k);
  if (lendoSemDados()) return '<div class="empty"><b>Lendo o Onvio…</b><p>Os resultados aparecem aqui assim que as primeiras empresas forem lidas.</p></div>';
  if (!rows.length && (real() || nsnap) && k === 'notificacoes') {
    if (!nsnap) {
      const motivo = nestado && nestado.estado === 'lendo' ? 'Lendo agora…' : nestado && nestado.msg ? `Última tentativa não deu certo: ${esc(nestado.msg)}` : 'A leitura é automática com o Onvio aberto (visão do escritório).';
      return `<div class="empty"><b>Notificações ainda não lidas.</b><p>${motivo} Ou use "Testar leitura das notificações" em Coleta.</p></div>`;
    }
    const padrao = nsnap.itens.filter(u => u.estado === 'padrao').length, conf = nsnap.itens.filter(u => u.estado === 'configurado').length;
    return `<div class="empty"><b>Ninguém está sem aviso de nova solicitação.</b><p>${conf} funcionário(s) têm configuração salva e todos recebem o aviso (e-mail ou sistema). Outros ${padrao} nunca tiveram a configuração alterada (no Onvio aparecem desmarcados) e não estão sendo contados: marque a opção em Coleta para listá-los.</p></div>`;
  }
  if (!rows.length && real() && k === 'semEnvio' && cfg.trained.length && !term() && state.setor === 'Todos') return emDiaHtml();
  if (!rows.length && real() && k === 'semEnvio' && !cfg.trained.length) return `<div class="empty"><b>Lista de treinados vazia.</b><p>Sem a lista, o monitor não sabe quais empresas acompanhar. ${cfg.hubCodigo ? 'Puxe do Control Hub (precisa do Hub aberto numa aba do claude.ai) ou cadastre em Configurações.' : 'Cole o código de pareamento do Hub em Configurações para puxar sozinho, ou cadastre a lista à mão.'}</p><div class="row" style="display:flex;gap:8px;justify-content:center;margin-top:10px">${cfg.hubCodigo ? '<button type="button" class="btn btn-primary" data-puxar>Puxar do Hub agora</button>' : ''}<button type="button" class="btn" data-go="config">Abrir Configurações</button></div></div>`;
  if (!rows.length) return `<div class="empty"><b>${term() || state.setor !== 'Todos' ? 'Nada neste filtro.' : 'Nenhuma pendência neste monitor.'}</b><p>${term() || state.setor !== 'Todos' ? 'Ajuste a busca ou o setor.' : 'Tudo em dia na última coleta.'}</p>${term() || state.setor !== 'Todos' ? '<button class="btn btn-sm" data-clear type="button">Limpar filtros</button>' : ''}</div>`;
  return `<div class="tbl-wrap"><table><thead><tr>${t.cols.map(([n, c = '']) => `<th class="${c}">${n}</th>`).join('')}</tr></thead><tbody>${
    rows.slice(0, state.lim[k] || LIM).map(r => `<tr>${t.row(r).map((c, i) => `<td class="${t.cols[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="tbl-foot"><span>${Math.min(rows.length, state.lim[k] || LIM)} de ${rows.length} itens${rows.length > (state.lim[k] || LIM) ? ` · <button class="btn btn-sm" data-mais="${k}" type="button">Mostrar mais ${LIM}</button>` : ''}</span><span>Fonte: ${k === 'notificacoes' ? 'Onvio' : fonteNome().toLowerCase()}</span></div>`;
}
const silAtivas = () => ((cfg && cfg.silenciadas) || []).filter(x => silenciadaAgora(x));
function silBarHtml() { const n = silAtivas().length; return `<div class="tbl-foot"><span>${n ? `${n} empresa${n > 1 ? 's' : ''} silenciada${n > 1 ? 's' : ''}` : ''}</span><span style="display:flex;gap:8px">${n ? '<button type="button" class="btn btn-sm" data-sil-ver>Ver silenciadas</button>' : ''}<button type="button" class="btn btn-sm" data-go="envios">Ver últimos envios de todas as empresas</button></span></div>`; }
// Últimos envios de TODAS as empresas lidas (e das treinadas, mesmo sem nada lido): o registro para quem monitora conferir que está tudo certo.
// Uso do portal = o mais recente entre arquivo enviado pelo cliente e atividade do cliente nas Solicitações (de todas as empresas). A empresa treinada
// vale pela raiz do CNPJ (o Hub e o Onvio podem cadastrar estabelecimentos diferentes do mesmo grupo).
function ultimosEnvios() {
  const src = source(), ult = new Map(), nomes = new Map(), raizes = new Set((cfg.trained || []).map(t => raizDoCnpj(t.cnpj)));
  for (const e of (real() && real().empresas) || []) { nomes.set(e.cnpj, e.empresa); if (!ult.has(e.cnpj)) ult.set(e.cnpj, { empresa: e.empresa, cnpj: e.cnpj, data: '', fonte: '', detalhe: '' }); }
  for (const d of src.docs || []) {
    if (d.origem !== 'cliente' || !d.data) continue;
    const x = ult.get(d.cnpj);
    if (!x || !x.data || d.data > x.data) ult.set(d.cnpj, { empresa: d.empresa || (x && x.empresa) || formatCnpj(d.cnpj), cnpj: d.cnpj, data: d.data, fonte: 'arquivo', detalhe: d.arquivo });
  }
  for (const [cnpj, iso] of Object.entries(src.solic || {})) {
    const x = ult.get(cnpj);
    if (!x || !x.data || iso > x.data) ult.set(cnpj, { empresa: (x && x.empresa) || nomes.get(cnpj) || formatCnpj(cnpj), cnpj, data: iso, fonte: 'solicitação', detalhe: '' });
  }
  const tem = new Set([...ult.keys()].map(raizDoCnpj));
  for (const t of cfg.trained || []) if (!tem.has(raizDoCnpj(t.cnpj))) ult.set(t.cnpj, { empresa: t.empresa, cnpj: t.cnpj, data: '', fonte: '', detalhe: '' });
  const hoje = Date.now();
  return [...ult.values()].map(x => ({ ...x, treinada: raizes.has(raizDoCnpj(x.cnpj)), dias: x.data ? Math.max(0, Math.floor((hoje - Date.parse(x.data + 'T00:00:00Z')) / 864e5)) : null }));
}
function enviosHtml() {
  if (lendoSemDados() || !real()) return '<div class="empty"><b>Nada lido ainda.</b><p>Os últimos envios aparecem assim que as primeiras empresas forem lidas.</p></div>';
  const limite = cfg.diasSemEnvio;
  const classe = r => r.dias === null ? 'semreg' : r.dias > limite ? 'sem' : 'uso';
  let base = ultimosEnvios();
  const q = term(); if (q) base = base.filter(r => `${r.empresa} ${r.cnpj} ${r.detalhe}`.toLowerCase().includes(q));
  if (state.soTreinadas) base = base.filter(r => r.treinada);
  const cont = { uso: 0, sem: 0, semreg: 0 }; base.forEach(r => cont[classe(r)]++);
  const sel = state.envClasse || 'todas';
  let rows = sel === 'todas' ? base : base.filter(r => classe(r) === sel);
  rows.sort((a, b) => (b.dias ?? 1e6) - (a.dias ?? 1e6));         // quem está há mais tempo sem usar (ou sem registro) primeiro
  const lim = state.lim.envios || LIM, total = rows.length;
  const sit = r => ({ uso: badge('Em uso', 's-ok'), sem: badge('Sem uso', 's-warn'), semreg: badge('Sem registro', 's-late') })[classe(r)];
  const chip = (k, rot, n) => `<button type="button" data-env-classe="${k}" aria-pressed="${sel === k}">${rot} <small>${n}</small></button>`;
  const todasSolic = ssnap && ssnap.escopo === 'todas-v2';
  const nota = `Uso do portal = arquivo enviado pelo cliente ou atividade do cliente em Solicitações de Serviço${todasSolic ? ' (de todas as empresas)' : ' (por enquanto só das treinadas: a leitura das demais ainda não terminou)'}. Matriz e filiais contam como uma empresa só nas treinadas. Sem uso = mais de ${limite} dias. Sem registro = nenhum arquivo nem solicitação do cliente encontrados.`;
  return `<div class="toolbar"><span class="grow">${base.length} empresa${base.length === 1 ? '' : 's'}</span>
      <div class="seg" role="group" aria-label="Situação">${chip('todas', 'Todas', base.length)}${chip('uso', 'Em uso', cont.uso)}${chip('sem', 'Sem uso', cont.sem)}${chip('semreg', 'Sem registro', cont.semreg)}</div>
      <div class="seg" role="group" aria-label="Quais empresas"><button type="button" data-env-trein="0" aria-pressed="${!state.soTreinadas}">Todas as lidas</button><button type="button" data-env-trein="1" aria-pressed="${!!state.soTreinadas}">Só treinadas</button></div></div>
    <section class="blk"><div class="blk-b">${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Treinada</th><th>Último uso</th><th>Há</th><th>Origem</th><th>Situação</th></tr></thead><tbody>${rows.slice(0, lim).map(r => `<tr><td><span class="emp">${esc(r.empresa)}</span></td><td class="num">${esc(formatCnpj(r.cnpj))}</td><td>${r.treinada ? badge('Sim', 's-ok') : '<span class="muted">—</span>'}</td><td class="num">${r.data ? fmt(r.data) : '<span class="muted">—</span>'}</td><td class="num">${r.dias === null ? '—' : r.dias + ' dias'}</td><td>${esc(r.fonte || '—')}${r.detalhe ? ` <span class="muted" title="${esc(r.detalhe)}">· ${esc(r.detalhe.length > 34 ? r.detalhe.slice(0, 33) + '…' : r.detalhe)}</span>` : ''}</td><td>${sit(r)}</td></tr>`).join('')}</tbody></table></div><div class="tbl-foot"><span>${Math.min(rows.length, lim)} de ${total}${total > lim ? ` · <button class="btn btn-sm" data-mais="envios" type="button">Mostrar mais ${LIM}</button>` : ''}</span><span style="max-width:62ch;text-align:right">${esc(nota)}</span></div>` : '<div class="empty"><b>Nada neste filtro.</b></div>'}</div></section>`;
}
// Nenhuma treinada sem envio: mostra POR QUE (cada empresa com a última atividade e de onde veio), para dar para conferir a leitura.
function emDiaHtml() {
  const src = source(), lista = statusEnvio(src.docs, cfg.trained, new Date(), src.solic).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  const silenciadas = new Set(silAtivas().map(x => x.cnpj));
  const avisos = [];
  if (!ssnap) avisos.push('As Solicitações de Serviço ainda não foram lidas: por enquanto só os arquivos contam como envio.');
  else if (ssnap.semCodigo) avisos.push(`${ssnap.semCodigo} empresa(s) treinada(s) sem código no Onvio: para elas as Solicitações não foram consideradas.`);
  if (real().lendo || real()._atualizando) avisos.push('Uma leitura nova das empresas está em andamento; estes números são os da última leitura completa e atualizam quando ela terminar.');
  const emDia = lista.filter(r => r.dias !== null && r.dias <= cfg.diasSemEnvio).length;
  const titulo = emDia === lista.length ? (lista.length === 1 ? `A empresa treinada usou o portal nos últimos ${cfg.diasSemEnvio} dias.` : `Todas as ${lista.length} empresas treinadas usaram o portal nos últimos ${cfg.diasSemEnvio} dias.`) : `Nenhuma empresa para acompanhar agora: ${emDia} de ${lista.length} usaram o portal nos últimos ${cfg.diasSemEnvio} dias e as outras estão silenciadas ou em carência desde o treinamento.`;
  return `<div class="empty"><b>${titulo}</b><p>Confira abaixo a última atividade de cada uma e de onde veio (arquivo enviado ou Solicitação de Serviço).</p></div>
    <div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Última atividade</th><th>Situação</th></tr></thead><tbody>${lista.map(r => `<tr><td><span class="emp">${esc(r.empresa)}</span></td><td class="num">${esc(formatCnpj(r.cnpj))}</td><td>${r.dias === null ? '<span class="muted">nenhuma registrada</span>' : `há ${r.dias} dias <span class="muted">· ${esc(r.fonte)}</span>`}</td><td>${silenciadas.has(r.cnpj) ? badge('Silenciada', 's-warn') : r.dias === null ? badge('Carência desde o treinamento', 's-warn') : badge('Em dia', 's-ok')}</td></tr>`).join('')}</tbody></table></div>
    ${avisos.length ? `<p class="note-txt">${avisos.map(esc).join(' ')}</p>` : ''}`;
}
function blockHtml(k) {
  const t = TABS[k], open = state.open[k];
  return `<section class="blk"><button type="button" class="blk-h" data-blk="${k}" aria-expanded="${open}"><span class="chev">${I.chev}</span><h2>${esc(t.title)}</h2><span class="count">${data(k).length}</span><span class="hint">${esc(t.hint)}</span>${I.info}</button><div class="blk-b" ${open ? '' : 'hidden'}>${tableHtml(k)}${k === 'semEnvio' ? silBarHtml() : ''}</div></section>`;
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
    <div><span class="eyebrow">Carteira no portal · ${real() ? (real().lendo ? 'lendo ao vivo' : real()._atualizando ? 'última coleta completa · atualizando' : 'coleta do Onvio') : lendoSemDados() ? 'lendo agora' : 'coleta de exemplo'} ${hora()}</span>
    <h2>${semLeitura ? (lendoSemDados() ? 'Lendo o Onvio…' : 'Nada foi lido ainda') : n ? `${n} pendências para acompanhar` : 'Tudo em dia'}</h2>
    <p>${semLeitura ? (lendoSemDados() ? 'Os resultados aparecem aqui assim que as primeiras empresas forem lidas.' : 'A leitura do Onvio não trouxe nenhuma empresa. Veja o andamento em Coleta do Onvio.') : `${Math.max(0, universo() - empresasComPend)} de ${universo()} empresas sem pendência de documentos`}</p>
    ${top ? `<div class="inner"><span class="badge ${TABS[top.k].sev}">Mais urgente</span><b>${esc(TABS[top.k].step(top.r)[0])}</b></div>` : ''}
    <div class="inner"><span>Monitores:</span>${KEYS.map(k => `<span class="chip ${TABS[k].sev.replace('s-', 'c-')}" style="--c:var(--status-${TABS[k].sev.slice(2)})">${esc(TABS[k].label)} <small>${data(k).length}</small></span>`).join('')}</div></div></div>`;
  const steps = all.slice(0, 3).map(({ k, r }) => { const [a, b] = TABS[k].step(r); return `<button type="button" class="step ${TABS[k].sev}" data-go="${k}"><i class="dot"></i><div><b>${esc(a)}</b><small>${esc(b)}</small></div>${I.right}</button>`; }).join('') || '<div class="empty"><b>Nada a acompanhar.</b></div>';
  const recados = recadosAtuais().filter(r => !state.dispensados.has(r.id));
  const notes = `<div class="card notes"><h2>${I.info} Recados <span class="count">${recados.length}</span></h2>${recados.map(r => `<div class="note"><div><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p></div><button type="button" data-dismiss="${r.id}" aria-label="Dispensar recado">${I.x}</button></div>`).join('') || '<div class="note"><p>Sem recados.</p></div>'}</div>`;
  const metrics = `<div class="metrics">${KEYS.map(k => `<button type="button" class="metric ${data(k).length ? 'has' : ''}" data-go="${k}"><span>${esc(TABS[k].label)}</span><span class="count">${data(k).length}</span>${I.info}</button>`).join('')}</div>`;
  return `<div class="toolbar"><span class="grow">${n} pendências</span><button class="btn" id="exp" type="button" title="Baixa as pendências que estão na tela (respeita busca e setor)">Exportar CSV</button></div>
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
    renderColeta($('coletaRoot'), { toast, onChanged: async () => { snap = await loadSnapshot(); snapCompleto = (await loadSnapshotCompleto()) || snapCompleto; recompute(); renderNav(); atualizarPill(); } });
    return renderNav();
  }
  const hoje = state.view === 'hoje';
  const envios = state.view === 'envios';
  $('title').textContent = hoje ? 'Hoje' : envios ? 'Últimos envios' : TABS[state.view].label;
  $('sub').textContent = hoje ? 'Portal do Cliente · ControlTax' : envios ? 'Quando cada empresa usou o portal pela última vez' : TABS[state.view].hint;
  atualizarPill();
  const html = hoje ? hojeHtml() : envios ? enviosHtml() : `<div class="toolbar"><span class="grow">${data(state.view).length} itens</span></div>${blockHtml(state.view)}`;
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
  v.querySelectorAll('[data-puxar]').forEach(e => e.addEventListener('click', async () => {
    e.disabled = true; e.textContent = 'Perguntando ao Hub…';
    const r = await puxarTreinados();
    if (r.ok) { cfg = await loadConfig(); recompute(); renderNav(); render(false); toast(`${r.n} empresas treinadas puxadas do Hub`); } else { toast(r.msg || 'Não deu certo', 'warn'); e.disabled = false; e.textContent = 'Puxar do Hub agora'; }
  }));
  v.querySelectorAll('[data-env-classe]').forEach(e => e.addEventListener('click', () => { state.envClasse = e.dataset.envClasse; render(false); }));
  v.querySelectorAll('[data-env-trein]').forEach(e => e.addEventListener('click', () => { state.soTreinadas = e.dataset.envTrein === '1'; render(false); }));
  v.querySelectorAll('#exp').forEach(e => e.addEventListener('click', exportarCsv));
  v.querySelectorAll('[data-avisar]').forEach(e => e.addEventListener('click', () => abrirAviso(e.dataset.avisar)));
  v.querySelectorAll('[data-sil]').forEach(e => e.addEventListener('click', () => abrirSilenciar(e.dataset.sil)));
  v.querySelectorAll('[data-sil-ver]').forEach(e => e.addEventListener('click', abrirSilenciadas));
  v.querySelectorAll('[data-clear]').forEach(e => e.addEventListener('click', () => { $('search').value = ''; state.setor = 'Todos'; render(); }));
  renderNav();
}
// Silenciar uma empresa em "Treinados sem envio": motivo e até quando (ou sem data). Vale só neste navegador; vencida a data, volta a ser acompanhada.
async function salvarSilenciadas(lista) {
  const c = { ...(await loadConfig()), silenciadas: lista }; const r = await saveConfig(c);
  if (!r.ok) { toast('Não foi possível salvar', 'warn'); return false; }
  cfg = c; recompute(); renderNav(); render(false); return true;
}
function dialogo(html) {
  document.querySelectorAll('dialog.sil-dlg').forEach(d => d.remove());
  const d = document.createElement('dialog'); d.className = 'sil-dlg'; d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener('close', () => d.remove()); d.showModal(); return d;
}
function abrirSilenciar(cnpj) {
  const emp = ((R.semEnvio || []).find(r => r.cnpj === cnpj) || (cfg.trained || []).find(t => t.cnpj === cnpj) || {}).empresa || formatCnpj(cnpj);
  const d = dialogo(`<form method="dialog" class="dlg-body" style="display:grid;gap:12px;min-width:min(420px,86vw)"><h2 style="margin:0">Silenciar ${esc(emp)}</h2>
    <p class="note-txt" style="margin:0">A empresa sai de "Treinados sem envio" pelo tempo escolhido e volta sozinha depois.</p>
    <label class="field">Por quanto tempo<select id="sil-dias"><option value="15">15 dias</option><option value="30" selected>30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="0">Sem data (até eu voltar a acompanhar)</option></select></label>
    <label class="field">Motivo<input id="sil-motivo" maxlength="120" autocomplete="off" placeholder="Ex.: sem movimento, férias coletivas"></label>
    <div class="row" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="sil-cancela">Cancelar</button><button type="button" class="btn btn-primary" id="sil-ok">Silenciar</button></div></form>`);
  d.querySelector('#sil-cancela').addEventListener('click', () => d.close());
  d.querySelector('#sil-ok').addEventListener('click', async () => {
    const dias = Number(d.querySelector('#sil-dias').value), ate = dias ? new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10) : '';
    const nova = [...((cfg.silenciadas) || []).filter(x => x.cnpj !== cnpj), { cnpj, ate, motivo: d.querySelector('#sil-motivo').value.trim().slice(0, 120), em: new Date().toISOString().slice(0, 10) }];
    if (await salvarSilenciadas(nova)) { d.close(); toast(`${emp} silenciada${ate ? ' até ' + fmt(ate) : ''}`); }
  });
}
// Avisar o cliente: mostra o texto para conferir e abre o RASCUNHO no Zimbra (link de verdade). A extensão nunca envia nada.
function abrirAviso(cnpj) {
  const r = (R.semEnvio || []).find(x => x.cnpj === cnpj); if (!r) return;
  const src = source(), st = statusEnvio(src.docs, [r], new Date(), src.solic)[0];
  let data = ''; if (st && st.dias !== null) data = new Date(Date.now() - st.dias * 864e5).toISOString().slice(0, 10);
  const m = montarAviso(cfg, { empresa: r.empresa, dias: r.dias, data });
  const d = dialogo(`<div class="dlg-body" style="display:grid;gap:10px;min-width:min(620px,92vw)"><h2 style="margin:0">Avisar ${esc(r.empresa)}</h2>
    <p class="note-txt" style="margin:0">Confira e edite o texto. O botão abre o rascunho no Zimbra; <b>quem envia é você</b>. Os contatos da empresa vêm do Control Hub (Para: quem tem acesso a mais setores; os outros em cópia) e você pode ajustar.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field">Para<input id="av-para" autocomplete="off" spellcheck="false" placeholder="e-mail do contato"></label><label class="field">Cópia<input id="av-cc" autocomplete="off" spellcheck="false" placeholder="outros e-mails, separados por vírgula"></label></div>
    <p class="note-txt" id="av-contatos" style="margin:0">Buscando os contatos no Hub…</p>
    <label class="field">Assunto<input id="av-assunto" value="${esc(m.assunto)}" maxlength="150" autocomplete="off"></label>
    <label class="field">Mensagem<textarea id="av-corpo" rows="10" style="width:100%">${esc(m.corpo)}</textarea></label>
    <div class="row" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn" id="av-copiar">Copiar texto</button><button type="button" class="btn" id="av-fecha">Cancelar</button><a class="btn btn-primary" id="av-zimbra" href="#" target="_blank" rel="noopener">Abrir no Zimbra</a></div></div>`);
  const link = () => linkZimbra(cfg.zimbraUrl, { assunto: d.querySelector('#av-assunto').value, corpo: d.querySelector('#av-corpo').value, para: d.querySelector('#av-para').value.trim(), cc: d.querySelector('#av-cc').value.trim() });
  const za = d.querySelector('#av-zimbra'); za.href = link();
  ['#av-assunto', '#av-corpo', '#av-para', '#av-cc'].forEach(q => d.querySelector(q).addEventListener('input', () => { za.href = link(); }));
  contatosDoHub(r.cnpj).then(c => {                 // contatos do grupo no Hub: só em memória, nunca guardados
    if (!d.isConnected) return;
    const nota = d.querySelector('#av-contatos');
    if (!c.ok) { nota.textContent = `Contatos não carregados: ${c.msg || 'tente de novo'} Escolha o destinatário no Zimbra.`; return; }
    const dest = destinatarios(c.contatos);
    if (!dest.total) { nota.textContent = 'O Hub não tem contato com e-mail para esta empresa. Escolha o destinatário no Zimbra.'; return; }
    if (!d.querySelector('#av-para').value) d.querySelector('#av-para').value = dest.para;
    if (!d.querySelector('#av-cc').value) d.querySelector('#av-cc').value = dest.cc.join(', ');
    nota.textContent = `${dest.total} contato${dest.total > 1 ? 's' : ''} no Hub${dest.cortados ? ` (${dest.cortados} ficaram de fora da cópia)` : ''}: ${dest.pessoas.slice(0, 4).map(x => `${x.nome || x.email}${x.setores.length ? ' (' + x.setores.join(', ') + ')' : ''}`).join('; ')}${dest.pessoas.length > 4 ? '…' : ''}`;
    za.href = link();
  });
  d.querySelector('#av-fecha').addEventListener('click', () => d.close());
  d.querySelector('#av-copiar').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${d.querySelector('#av-assunto').value}\n\n${d.querySelector('#av-corpo').value}`); toast('Texto copiado'); } catch (e) { toast('Não foi possível copiar', 'warn'); } });
  za.addEventListener('click', async () => {       // registra o dia em que o rascunho foi aberto (não quer dizer que foi enviado)
    const c = { ...(await loadConfig()) }; c.avisados = { ...(c.avisados || {}), [cnpj]: new Date().toISOString().slice(0, 10) };
    if ((await saveConfig(c)).ok) { cfg = c; setTimeout(() => { render(false); d.close(); }, 300); }
  });
}
function abrirSilenciadas() {
  const nome = c => ((cfg.trained || []).find(t => t.cnpj === c) || {}).empresa || formatCnpj(c);
  const lin = silAtivas().map(x => `<tr><td><span class="emp">${esc(nome(x.cnpj))}</span></td><td>${x.ate ? 'até ' + fmt(x.ate) : 'sem data'}</td><td>${esc(x.motivo || '—')}</td><td class="r"><button type="button" class="btn btn-sm" data-volta="${esc(x.cnpj)}">Voltar a acompanhar</button></td></tr>`).join('');
  const d = dialogo(`<div class="dlg-body" style="display:grid;gap:12px;min-width:min(640px,92vw)"><h2 style="margin:0">Empresas silenciadas</h2>
    ${lin ? `<div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>Silenciada</th><th>Motivo</th><th></th></tr></thead><tbody>${lin}</tbody></table></div>` : '<p class="note-txt">Nenhuma empresa silenciada agora.</p>'}
    <div class="row" style="display:flex;justify-content:flex-end"><button type="button" class="btn" id="sil-fecha">Fechar</button></div></div>`);
  d.querySelector('#sil-fecha').addEventListener('click', () => d.close());
  d.querySelectorAll('[data-volta]').forEach(b => b.addEventListener('click', async () => { if (await salvarSilenciadas((cfg.silenciadas || []).filter(x => x.cnpj !== b.dataset.volta))) { d.close(); toast('Voltou a ser acompanhada'); } }));
}
// Exportar o que está na tela (respeita busca e setor) para o Excel.
function exportarCsv() {
  const linhas = [['Monitor', 'Empresa ou funcionário', 'CNPJ', 'Detalhe']];
  KEYS.forEach(k => data(k).forEach(r => linhas.push([TABS[k].label, r.empresa || r.nome || '', r.cnpj ? formatCnpj(r.cnpj) : '', TABS[k].step(r)[1]])));
  if (linhas.length === 1) return toast('Nada para exportar neste filtro', 'warn');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([paraCsv(linhas)], { type: 'text/csv;charset=utf-8' }));
  a.download = `pendencias-portal-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`${linhas.length - 1} linhas exportadas`);
}
// Alertas: o que apareceu de novo desde a última vez e como cada monitor evolui (fase 6).
function abrirAlertas() {
  const nv = ((hist && hist.novas) || []).slice().sort((a, b) => Number(a.visto) - Number(b.visto) || String(b.em).localeCompare(String(a.em)));
  const lab = k => (TABS[k] || {}).label || k;
  const quando = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lista = nv.length ? `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:6px;max-height:42vh;overflow:auto">${nv.slice(0, 80).map(n => `<li style="display:flex;gap:8px;align-items:baseline;${n.visto ? 'opacity:.7' : ''}">${n.visto ? '' : '<span class="badge s-late">Nova</span>'}<span style="flex:1"><b>${esc(lab(n.k))}</b> · ${esc(n.texto)}</span><small class="muted">${quando(n.em)}</small></li>`).join('')}</ul>${nv.length > 80 ? `<p class="note-txt">e mais ${nv.length - 80}</p>` : ''}`
    : '<p class="note-txt" style="margin:0">Nada novo desde a leitura anterior.</p>';
  const ev = evolucao(hist, 7).filter(e => TABS[e.k]);
  const evol = ev.length ? `<div class="tbl-wrap"><table><thead><tr><th>Monitor</th><th class="num r">Agora</th><th class="num r">Há 7 dias</th><th class="num r">Variação</th></tr></thead><tbody>${ev.map(e => `<tr><td>${esc(lab(e.k))}</td><td class="num r">${e.agora}</td><td class="num r">${e.antes ?? '—'}</td><td class="num r">${e.delta === null ? '—' : e.delta > 0 ? `<span class="badge s-late">+${e.delta}</span>` : e.delta < 0 ? `<span class="badge s-ok">${e.delta}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div><p class="note-txt" style="margin:0">Compara com a leitura mais próxima de 7 dias atrás${hist.serie && hist.serie.length ? ` (histórico desde ${quando(hist.serie[0].em)})` : ''}.</p>` : '<p class="note-txt" style="margin:0">O histórico começa na primeira leitura completa; a evolução aparece com o passar dos dias.</p>';
  const d = dialogo(`<div class="dlg-body" style="display:grid;gap:14px;min-width:min(660px,92vw)"><h2 style="margin:0">Alertas</h2>
    <section style="display:grid;gap:8px"><h3 class="sub-h" style="margin:0">Novas desde a leitura anterior</h3>${lista}</section>
    <section style="display:grid;gap:8px"><h3 class="sub-h" style="margin:0">Evolução dos monitores</h3>${evol}</section>
    <div class="row" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="al-vistas" ${naoVistas(hist).length ? '' : 'disabled'}>Marcar como vistas</button><button type="button" class="btn btn-primary" id="al-fecha">Fechar</button></div></div>`);
  d.querySelector('#al-fecha').addEventListener('click', () => d.close());
  d.querySelector('#al-vistas').addEventListener('click', async () => { try { await chrome.storage.local.set({ [CHAVE_HIST]: marcarVistas(hist) }); } catch (e) { /* fora da extensão */ } hist = marcarVistas(hist); sino(); d.close(); toast('Marcadas como vistas'); });
}
function go(k) { state.view = k; render(true); window.scrollTo(0, 0); }

$('search').addEventListener('input', () => { if (state.view !== 'config' && state.view !== 'coleta') render(); });
$('cfgBtn').addEventListener('click', () => go('config'));
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search').focus(); } });
$('bell').addEventListener('click', () => abrirAlertas());
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
  const batida = () => { try { parent.postMessage({ tipo: 'controlmon-vivo' }, '*'); } catch (e) { /* sem pai */ } };   // avisa a camada de que o painel está vivo (ela mostra uma saída se parar)
  batida(); setInterval(batida, 3000);
  $('fechar').addEventListener('click', fechar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('overlay').classList.contains('open')) fechar(); });
}
Promise.all([loadConfig(), loadSnapshot(), loadSnapshotCompleto()]).then(([c, sn, comp]) => {
  cfg = c; snap = sn; snapCompleto = comp || (sn && sn.fonte === 'onvio' && !sn.lendo && !sn.parcial ? sn : null); recompute(); setTimeout(() => render(true), 300);
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
    if (ch['monitor-notificacoes-estado']) { nestado = ch['monitor-notificacoes-estado'].newValue || null; recompute(); renderSuave(); }
    if (ch[CHAVE_HIST]) { hist = ch[CHAVE_HIST].newValue || null; sino(); }
    if (ch['monitor-solicitacoes']) { ssnap = ch['monitor-solicitacoes'].newValue || null; recompute(); renderNav(); renderSuave(); }
    if (ch['monitor-notificacoes']) nsnap = ch['monitor-notificacoes'].newValue || null;
    if (ch['monitor-gestta']) gsnap = ch['monitor-gestta'].newValue || null;
    if (ch['monitor-gestta-estado']) gestado = ch['monitor-gestta-estado'].newValue || null;
    if (ch['monitor-snapshot']) { snap = await loadSnapshot(); if (snap && snap.fonte === 'onvio' && !snap.lendo && !snap.parcial) snapCompleto = snap; }
    if (ch['monitor-snapshot-completo']) snapCompleto = ch['monitor-snapshot-completo'].newValue || snapCompleto;
    if (ch['monitor-snapshot'] || ch['monitor-snapshot-completo'] || ch['monitor-notificacoes'] || ch['monitor-coleta-estado'] || ch['monitor-gestta'] || ch['monitor-gestta-estado']) { recompute(); atualizarPill(); renderSuave(); }
  });
  chrome.storage.local.get(['monitor-gestta', 'monitor-gestta-estado']).then(r => { gsnap = r['monitor-gestta'] || null; gestado = r['monitor-gestta-estado'] || null; recompute(); renderSuave(); });
  chrome.storage.local.get(['monitor-notificacoes', 'monitor-notificacoes-estado', 'monitor-solicitacoes', CHAVE_HIST]).then(r => { hist = r[CHAVE_HIST] || null; sino(); ssnap = r['monitor-solicitacoes'] || null; nsnap = r['monitor-notificacoes'] || null; nestado = r['monitor-notificacoes-estado'] || null; recompute(); renderSuave(); });
  chrome.storage.local.get('monitor-coleta-estado').then(r => { andamento = r['monitor-coleta-estado'] || null; if (andamento) { recompute(); renderSuave(); } });
} catch (e) { /* fora da extensão */ }
