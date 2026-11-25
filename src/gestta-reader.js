// Leitor do Gestta (Fase 5). SÓ LEITURA, lista fechada, e o token do Gestta NUNCA passa por aqui: o "bruto" injetado faz o fetch dentro
// da página (com o token que só existe lá) e devolve só { status, ct, body }. Segue as regras do Control Onvio para o Gestta:
// GET em api.gestta.com.br e um POST que só lê (busca de tarefas, usada só para contar). Do cadastro dos funcionários NADA sensível é
// lido: permissões, tentativas e último login são descartados antes de qualquer uso.
import { AuthError, lerResposta, camposDe } from './onvio-reader.js';

export const GESTTA_API = 'https://api.gestta.com.br';
const ID24 = /^[0-9a-f]{24}$/i;
const SENSIVEL = /^(permissions?|attempts?|attempt|last_?login|password|senha|token|jwt|secret|revocation_?password)$/i;
const pausaPadrao = ms => new Promise(r => setTimeout(r, ms));

/** Só estas leituras: perfil, setores, lista de funcionários, detalhe de um funcionário e a busca de tarefas (contagem). */
export function leituraPermitida(metodo, url, corpo) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (u.origin !== GESTTA_API || u.username || u.password) return false;
  const p = u.pathname.replace(/\/+$/, '');
  const m = String(metodo || 'GET').toUpperCase();
  if (m === 'GET') return p === '/core/company/user/me' || p === '/core/company/department' || p === '/admin/company/user' || /^\/admin\/company\/user\/[0-9a-f]{24}$/i.test(p);
  if (m === 'POST' && p === '/core/customer/task/search') {
    if (!corpo || typeof corpo !== 'object') return false;
    const OK = new Set(['page', 'limit', 'type', 'status', 'date_type', 'start_date', 'end_date', 'company_user', 'company_department']);
    return Object.keys(corpo).every(k => OK.has(k)) && Number(corpo.limit) <= 100;
  }
  return false;
}
/** Rota sem ids nem valores de consulta (para relatório). */
export const rotuloGestta = url => { try { const u = new URL(url); return u.pathname.replace(/[0-9a-f]{24}/gi, '{id}') + (u.search ? '?' + [...u.searchParams.keys()].join('&') : ''); } catch (e) { return String(url).slice(0, 60); } };

/**
 * Leitor com guarda: leitor(metodo, url, corpo) -> dados. bruto(metodo, url, corpo) -> {status, ct, body}.
 * Espera e tenta de novo em 503/429. Registra cada chamada (rota sem ids, ok/erro) em onChamada.
 */
export function criarLeitor(bruto, { onChamada, espera = pausaPadrao } = {}) {
  return async (metodo, url, corpo) => {
    if (!leituraPermitida(metodo, url, corpo)) throw new Error('leitura não permitida: ' + String(url).slice(0, 80));
    const t0 = Date.now(), rotulo = `${String(metodo).toUpperCase()} ${rotuloGestta(url)}`;
    try {
      let v = await bruto(metodo, url, corpo);
      if (v.status === 503) { await espera(800); v = await bruto(metodo, url, corpo); }
      if (v.status === 429) { await espera(3000); v = await bruto(metodo, url, corpo); }
      if (v.status === 0) throw new Error('falha de rede (' + String(v.body).slice(0, 80) + ')');
      if (v.semSessao) throw new AuthError('sem sessão do Gestta nesta aba (faça login)');
      const d = lerResposta(v);
      if (onChamada) onChamada({ rota: rotulo, ok: true, ms: Date.now() - t0 });
      return d;
    } catch (e) { if (onChamada) onChamada({ rota: rotulo, ok: false, erro: String(e && e.message || e).slice(0, 90), ms: Date.now() - t0 }); throw e; }
  };
}

const listaDe = d => Array.isArray(d) ? d : (d && (d.items || d.docs || d.data || d.content || d.results)) || [];

/** Funcionários ativos do escritório: só campos seguros. */
export async function listarFuncionarios(leitor, { pausa } = {}) {
  const por = new Map();
  for (let pagina = 1; pagina <= 20; pagina++) {
    const d = await leitor('GET', `${GESTTA_API}/admin/company/user?active=true&limit=100&page=${pagina}`);
    const lote = listaDe(d); let novos = 0;
    for (const x of lote) {
      const id = x && (x._id || x.id); if (!id || por.has(String(id))) continue;
      por.set(String(id), { id: String(id), nome: String(x.name || ''), email: String(x.email || ''), role: String(x.role || ''), ativo: x.active !== false,
        setores: (Array.isArray(x.company_departments) ? x.company_departments : []).map(s => String(s && (s.name || s) || '')).filter(Boolean), raiz: !!x.root });
      novos++;
    }
    const total = Number(d && (d.total || d.totalItems)) || 0;
    if (lote.length < 100 || !novos || (total && por.size >= total)) break;
    if (pausa) await pausa(150);
  }
  return [...por.values()];
}

// ---------- Configuração de notificação do funcionário ----------
const CAMINHO_NOTIF = /(notif|aviso|alert|e-?mail|mail|whats|push|sms|receb|receive)/i;
const FORTE = /(notif|aviso|alert|receb|receive)/i, TAREFA = /(task|tarefa)/i;
/** Todos os campos verdadeiro/falso (até 4 níveis) cujo nome lembra notificação. Só caminhos e o valor booleano; o resto do cadastro é ignorado. */
export function candidatosNotificacao(detalhe) {
  const out = [];
  const ver = (o, cam, prof) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || prof > 4) return;
    for (const [k, v] of Object.entries(o)) {
      if (SENSIVEL.test(k)) continue;
      const c = cam ? `${cam}.${k}` : k;
      if (typeof v === 'boolean') { if (CAMINHO_NOTIF.test(c)) out.push({ caminho: c, valor: v, forte: FORTE.test(c) && TAREFA.test(c) }); }
      else if (v && typeof v === 'object') ver(v, c, prof + 1);
    }
  };
  ver(detalhe, '', 0);
  return out;
}
/** Qual campo diz "recebe notificação de tarefa nova". Configurado vale; senão, só se houver UM candidato forte. */
export function escolherCampo(candidatos, configurado = '') {
  if (configurado && candidatos.some(c => c.caminho === configurado)) return configurado;
  const fortes = candidatos.filter(c => c.forte);
  return fortes.length === 1 ? fortes[0].caminho : '';
}
export function valorNoCaminho(detalhe, caminho) {
  let o = detalhe; for (const k of String(caminho).split('.')) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
  return typeof o === 'boolean' ? o : null;
}

/** Tarefas abertas do funcionário: só o total da busca (1 item por chamada). */
export async function contarTarefasAtivas(leitor, idUsuario, janela) {
  const d = await leitor('POST', `${GESTTA_API}/core/customer/task/search`, { page: 1, limit: 1, type: ['RECURRENT', 'SERVICE_ORDER', 'ACCOUNTING'], status: ['OPEN', 'IMPEDIMENT'], date_type: 'DUE_DATE', ...janela, company_user: [idUsuario] });
  const n = d && (d.total ?? d.totalItems ?? d.count ?? (d.meta && d.meta.total));
  return Number.isFinite(Number(n)) && n !== null && n !== undefined ? Number(n) : null;
}
/** Janela larga em volta de hoje: do início do mês anterior ao fim do próximo. */
export function janelaAtiva(hoje = new Date()) {
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const ini = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0)), fim = new Date(Date.UTC(a, m + 2, 1, 2, 59, 59));
  return { start_date: ini.toISOString(), end_date: fim.toISOString() };
}

async function emParalelo(tarefas, n) {
  const out = new Array(tarefas.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => { while (i < tarefas.length) { const k = i++; out[k] = await tarefas[k](); } }));
  return out;
}

/**
 * Lê os funcionários e monta o que o monitor usa: { id, nome, email, setor, tarefasAtivas, notificaTarefa: true|false|null }.
 * notificaTarefa é null quando o campo da notificação ainda não foi identificado (a tela avisa, nunca chuta).
 * Perfil sem acesso ao cadastro (403) vira AuthError com mensagem clara.
 */
export async function lerFuncionarios(leitor, { campo = '', pausa, paralelo = 4, janela = janelaAtiva(), onProgresso } = {}) {
  let funcionarios;
  try { funcionarios = await listarFuncionarios(leitor, { pausa }); }
  catch (e) { if (e instanceof AuthError && /403/.test(e.message)) throw new AuthError('Seu acesso ao Gestta não inclui o cadastro de funcionários (precisa ser gestor ou administrador).'); throw e; }
  const ativos = funcionarios.filter(f => f.ativo);
  let feito = 0, campoUsado = campo, achados = [];
  const q = { funcionarios: ativos.length, detalhesLidos: 0, falhas: 0, semCampo: 0, semContagem: 0, todosZero: false };
  const users = await emParalelo(ativos.map(f => async () => {
    const u = { id: f.id, nome: f.nome, email: f.email, setor: f.setores.join(', '), role: f.role, tarefasAtivas: null, notificaTarefa: null };
    try {
      const det = await leitor('GET', `${GESTTA_API}/admin/company/user/${f.id}`);
      q.detalhesLidos++;
      const cands = candidatosNotificacao(det);
      if (!campoUsado) { const esc = escolherCampo(cands); if (esc) campoUsado = esc; }
      if (cands.length && !achados.length) achados = cands.map(c => c.caminho);
      if (campoUsado) u.notificaTarefa = valorNoCaminho(det, campoUsado);
      if (u.notificaTarefa === null) q.semCampo++;
    } catch (e) { if (e instanceof AuthError) throw e; q.falhas++; }
    try { u.tarefasAtivas = await contarTarefasAtivas(leitor, f.id, janela); if (u.tarefasAtivas === null) q.semContagem++; }
    catch (e) { if (e instanceof AuthError) throw e; q.falhas++; }
    if (onProgresso) onProgresso({ feito: ++feito, total: ativos.length });
    if (pausa) await pausa(60);
    return u;
  }), paralelo);
  // Todos com 0 tarefas e vários funcionários: quase certo que o Gestta está escondendo as tarefas (usuário sem departamento).
  q.todosZero = users.length >= 5 && users.every(u => u.tarefasAtivas === 0);
  return { users, campo: campoUsado, candidatos: achados, qualidade: q };
}

// ---------- Diagnóstico (só nomes de campos e contagens) ----------
const contar = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
export async function diagnosticarGestta(leitor, { chamadas = [], campo = '' } = {}) {
  const rep = { passos: [], avisos: [] };
  const passo = (nome, ok, detalhe = '') => rep.passos.push({ nome, ok, detalhe });
  try {
    const me = await leitor('GET', `${GESTTA_API}/core/company/user/me`);
    rep.eu = { role: String(me.role || ''), setores: (Array.isArray(me.company_departments) ? me.company_departments : []).length, campos: camposDe(Object.fromEntries(Object.entries(me).filter(([k]) => !SENSIVEL.test(k)))) };
    passo('Usuário logado no Gestta', true, `papel: ${rep.eu.role || '?'}, ${rep.eu.setores} setor(es)`);
  } catch (e) { passo('Usuário logado no Gestta', false, e.message); return fim(rep, chamadas); }
  let funcs;
  try { funcs = await listarFuncionarios(leitor); } catch (e) { passo('Lista de funcionários', false, e.message + (/403/.test(e.message) ? ' (o cadastro de funcionários exige gestor ou administrador)' : '')); return fim(rep, chamadas); }
  rep.funcionarios = { total: funcs.length, ativos: funcs.filter(f => f.ativo).length, papeis: contar(funcs.map(f => f.role || '(vazio)')), semSetor: funcs.filter(f => !f.setores.length).length };
  passo('Lista de funcionários', funcs.length > 0, `${funcs.length} funcionários`);
  const amostra = funcs.find(f => f.ativo && !f.raiz) || funcs[0];
  if (!amostra) return fim(rep, chamadas);
  try {
    const det = await leitor('GET', `${GESTTA_API}/admin/company/user/${amostra.id}`);
    const limpo = Object.fromEntries(Object.entries(det || {}).filter(([k]) => !SENSIVEL.test(k)));
    rep.detalhe = { campos: camposDe(limpo, 80) };
    const cands = candidatosNotificacao(det);
    rep.notificacao = { candidatos: cands.map(c => `${c.caminho}=${c.valor}${c.forte ? ' (provável)' : ''}`), escolhido: escolherCampo(cands, campo) };
    passo('Cadastro do funcionário', true, `${rep.detalhe.campos.length} campos (permissões e login nunca são lidos)`);
    if (!cands.length) rep.avisos.push('O cadastro do funcionário não tem nenhum campo verdadeiro/falso de notificação. A configuração pode estar em outra rota: use "Aprender chamadas do Gestta" e abra, no Gestta, a tela de notificações de um funcionário.');
    else if (!rep.notificacao.escolhido) rep.avisos.push('Há campos que parecem de notificação, mas nenhum é claramente "receber aviso de tarefa nova". Escolha o campo em Coleta › Gestta (campo da notificação).');
  } catch (e) { passo('Cadastro do funcionário', false, e.message); }
  try {
    const alvo = funcs.filter(f => f.ativo).slice(0, 8), cont = [];
    for (const f of alvo) cont.push(await contarTarefasAtivas(leitor, f.id, janelaAtiva()));
    const sem = cont.filter(n => n === null).length, comTarefa = cont.filter(n => n > 0).length;
    rep.contagem = { amostra: cont.length, comTarefas: comTarefa, zero: cont.filter(n => n === 0).length, semTotal: sem };
    passo('Contagem de tarefas por funcionário', sem === 0, sem ? 'a busca não trouxe o total' : `${comTarefa} de ${cont.length} funcionários da amostra com tarefas ativas`);
    if (sem) rep.avisos.push('A busca de tarefas não devolveu o total; o monitor não consegue saber quem tem tarefas ativas.');
    else if (cont.length >= 5 && !comTarefa) rep.avisos.push('Nenhum funcionário da amostra aparece com tarefas ativas. Se o seu usuário não tem departamento vinculado, o Gestta pode estar escondendo as tarefas na busca: entre com um gestor/administrador ou vincule um departamento ao seu usuário.');
  } catch (e) { passo('Contagem de tarefas por funcionário', false, e.message); }
  return fim(rep, chamadas);
}
function fim(rep, chamadas) {
  const por = new Map(); for (const c of chamadas) { const g = por.get(c.rota) || { rota: c.rota, n: 0, falhas: 0, erro: '' }; g.n++; if (!c.ok) { g.falhas++; g.erro = c.erro; } por.set(c.rota, g); }
  rep.chamadas = [...por.values()]; return rep;
}
export function textoRelatorioGestta(rep) {
  const L = ['RELATÓRIO DE LEITURA DO GESTTA (sem nomes de pessoas ou empresas, sem token)', ''];
  for (const p of rep.passos) L.push(`${p.ok ? '[ok]' : '[FALHOU]'} ${p.nome}: ${p.detalhe}`);
  if (rep.funcionarios) L.push('', `Funcionários: ${JSON.stringify(rep.funcionarios)}`);
  if (rep.contagem) L.push(`Contagem de tarefas (amostra): ${JSON.stringify(rep.contagem)}`);
  if (rep.eu) L.push(`Campos do usuário logado: ${rep.eu.campos.join(', ')}`);
  if (rep.detalhe) L.push(`Campos do cadastro do funcionário: ${rep.detalhe.campos.join(', ')}`);
  if (rep.notificacao) L.push(`Campos de notificação encontrados: ${rep.notificacao.candidatos.join(' | ') || '(nenhum)'}`, `Campo escolhido: ${rep.notificacao.escolhido || '(nenhum)'}`);
  if (rep.avisos.length) L.push('', ...rep.avisos.map(a => `AVISO: ${a}`));
  if (rep.chamadas && rep.chamadas.length) L.push('', 'Chamadas ao Gestta (rota, quantas, falhas):', ...rep.chamadas.map(c => `  ${c.falhas ? '[FALHOU]' : '[ok]    '} ${c.rota}  x${c.n}${c.falhas ? `  falhas: ${c.falhas}  ${c.erro}` : ''}`));
  return L.join('\n');
}
