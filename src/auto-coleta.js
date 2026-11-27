// Leitura do Onvio AO VIVO, em segundo plano, a partir da própria página do Onvio (carregado por src/overlay.js).
// Sem clique: assim que uma página do Onvio (visão do escritório) abre, a extensão lê as empresas 4 de cada vez, as TREINADAS PRIMEIRO,
// e entrega dados parciais ao painel a cada poucos segundos (o painel cresce enquanto lê). Terminada a leitura completa, relê só as
// empresas prioritárias a cada 10 min e a leitura completa a cada `horasAuto`. SÓ LEITURA (mesma lista fechada de rotas).
// Para sozinha com acesso de cliente, se a sessão cair ou se o Onvio pedir calma. Uma trava impede duas abas lendo ao mesmo tempo.
import { guardar, limitado, idsDaEquipe, pastasDoModelo, coletar, listarClientes, perfilDaSessao, fetcherComFallback, precisaColetar, precisaRapida, mesclarEmpresas, lerNotificacoesEscritorio, AuthError, API } from './onvio-reader.js';
import { loadConfig, DEPARTAMENTOS_LIDOS, raizesParaLer } from './config.js';
export const CHAVE_PASTAS_MODELO = 'monitor-pastas-modelo';
import { loadSnapshot, saveSnapshot, saveSnapshotCompleto, duracaoDe as duracao } from './snapshot.js';
import { puxarTreinados, CHAVE_HUB_ESTADO } from './hub-treinados.js';
import { lerEnviosPorSolicitacao, assinaturaTreinadas } from './solicitacoes.js';
import { rodarHistorico } from './historico-auto.js';

export const CHAVE_ESTADO = 'monitor-coleta-estado', CHAVE_TRAVA = 'monitor-coleta-trava', CHAVE_CLIENTES = 'monitor-clientes';
export const CHAVE_NOTIF = 'monitor-notificacoes';
const PARALELO = 24;           // empresas lidas ao mesmo tempo (as chamadas de todas passam pelo limite geral abaixo)
const LIMITE_INICIAL = 6, LIMITE_MAXIMO = 32;    // chamadas ao Onvio ao mesmo tempo: começa em 6 (para medir a resposta) e se ajusta sozinho: sobe se o Onvio responde rápido, desce se demora ou recusa
const pausa = ms => new Promise(r => setTimeout(r, ms));
const st = () => chrome.storage.local;
const idAba = Math.random().toString(36).slice(2);

async function gravarEstado(e) { try { await st().set({ [CHAVE_ESTADO]: { ...e, em: Date.now() } }); } catch (x) { /* sem storage */ } }
async function pegarTrava() {
  const t = (await st().get(CHAVE_TRAVA))[CHAVE_TRAVA];
  if (t && t.id !== idAba && Date.now() - t.em < 3 * 60 * 1000) return false;
  await st().set({ [CHAVE_TRAVA]: { id: idAba, em: Date.now() } });
  await pausa(400);
  return ((await st().get(CHAVE_TRAVA))[CHAVE_TRAVA] || {}).id === idAba;       // se duas abas escreveram juntas, só uma fica
}
const batida = () => st().set({ [CHAVE_TRAVA]: { id: idAba, em: Date.now() } }).catch(() => {});
const soltar = async () => { try { const t = (await st().get(CHAVE_TRAVA))[CHAVE_TRAVA]; if (t && t.id === idAba) await st().remove(CHAVE_TRAVA); } catch (x) { /* nada */ } };

// Dois jeitos de ler: de dentro da página (mesma origem, com o cookie) e, se não der, pelo service worker no mundo da página.
const brutoIsolado = async url => { try { const r = await fetch(url, { credentials: 'include' }); return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() }; } catch (e) { return { status: 0, ct: '', body: String(e) }; } };
const brutoPagina = async url => { try { return (await chrome.runtime.sendMessage({ tipo: 'ler-onvio', url })) || { status: 0, ct: '', body: 'sem resposta' }; } catch (e) { return { status: 0, ct: '', body: String(e) }; } };
const criarFetcher = ({ onChamada } = {}) => { const base = fetcherComFallback([{ via: 'página (mesma origem)', f: brutoIsolado }, { via: 'página do Onvio (mundo da página)', f: brutoPagina }]); const lim = limitado(guardar(base, onChamada), { max: LIMITE_MAXIMO, inicio: LIMITE_INICIAL }); return { base, f: lim, lim }; };
const compactos = cl => cl.map(c => ({ ids: c.ids, codigo: c.codigo, nome: c.nome, cnpj: c.cnpj, inativo: c.inativo }));

/** " · faltam ~N min" depois de algumas empresas lidas (só estimativa pelo ritmo até agora). */
export function previsao(t0, feito, total, agora = Date.now()) {
  if (feito < 15 || !total || feito >= total) return '';
  const min = Math.ceil(((agora - t0) / feito) * (total - feito) / 60000);
  return ` · faltam ~${min < 1 ? 1 : min} min`;
}
/** Lista de funcionários do escritório (para saber quem enviou cada arquivo); se não vier, a leitura segue com a dedução. */
async function equipeSegura(f) { try { return await idsDaEquipe(f); } catch (e) { if (e instanceof AuthError) throw e; return null; } }
let rodando = false;
/** Leitura completa (ao vivo). */
async function leituraCompleta(cfg, avisa) {
  const rotas = {};                                                            // quantas chamadas por rota (só nomes de rota sem ids, nunca dados)
  const { base, f, lim } = criarFetcher({ onChamada: c => { rotas[c.rota] = (rotas[c.rota] || 0) + 1; } });
  try { const perfil = perfilDaSessao(await f(API + 'security/v1/session-and-bindings')); if (perfil === 'cliente') { avisa({ estado: 'cliente', fimEm: Date.now(), msg: 'Acesso de cliente: não lê.' }); return; } } catch (e) { /* sessão é só informativa */ }
  avisa({ estado: 'rodando', feito: 0, total: 0, msg: 'Lendo a lista de empresas…' });
  const { clientes, falhaCnd } = await listarClientes(f, { pausa, onLista: l => avisa({ estado: 'rodando', feito: 0, total: 0, msg: `Lendo a lista de empresas… ${l.lidos}${l.total ? ' de ' + l.total : ''}` }) });
  try { await st().set({ [CHAVE_CLIENTES]: { em: Date.now(), clientes: compactos(clientes) } }); } catch (e) { /* cache é só para a releitura rápida */ }
  try {      // o padrão de pastas vem da empresa modelo (9999); falhar aqui não derruba a leitura (vale a lista das configurações)
    const pm = await pastasDoModelo(f, clientes, cfg.empresaModelo || '9999');
    if (pm.ok) await st().set({ [CHAVE_PASTAS_MODELO]: { em: Date.now(), codigo: pm.codigo, empresa: pm.empresa, nomes: pm.nomes } });
  } catch (e) { if (e instanceof AuthError) throw e; }
  const ativas = clientes.filter(c => !c.inativo && c.ids.length).length;
  const prioridade = new Set([...(cfg.trained || []).map(t => t.cnpj), ...raizesParaLer(cfg.trained)]);   // treinadas e seus outros estabelecimentos (mesma raiz) primeiro
  const equipeIds = await equipeSegura(f);
  const montar = (r, parcial) => ({ fonte: 'onvio', coletadoEm: Date.now(), docs: r.docs, empresas: r.empresas || [], ver: r.ver || {}, verEmpresa: r.verEmpresa || {}, totalEmpresas: ativas, qualidade: r.qualidade, parcial, lendo: parcial, falhaCnd: falhaCnd || '', auto: true, via: base.via || '' });
  const t0 = Date.now();
  avisa({ estado: 'rodando', feito: 0, total: ativas, msg: `0 de ${ativas} empresas` });
  const r = await coletar(f, clientes, { limite: 0, pausa, conhecidas: cfg.allowedFolders, descer: DEPARTAMENTOS_LIDOS, paralelo: PARALELO, rapido: true, prioridade, equipeIds,
    onProgresso: p => { batida(); avisa({ estado: 'rodando', feito: p.feito, total: p.total, msg: `${p.feito} de ${p.total} empresas${previsao(t0, p.feito, p.total)}` }); },
    onParcial: async p => { await saveSnapshot(montar(p, true)); } });
  const final = montar(r, !!r.qualidade.interrompida);
  const ms = Date.now() - t0, e = lim.estatisticas();
  final.desempenho = { ms, empresas: r.qualidade.lidas, falhas: r.qualidade.falhas, recuperadas: r.qualidade.recuperadas || 0, pastasVaziasPuladas: r.qualidade.pastasVaziasPuladas || 0, paginasPoupadas: r.qualidade.paginasPoupadas || 0, datasPastas: r.qualidade.datasPastas || null, chamadas: e.chamadas, chamadasPorSegundo: ms ? Math.round(e.chamadas / (ms / 1000) * 10) / 10 : 0, latenciaMediaMs: e.latenciaMediaMs, limiteFinal: e.limiteFinal, limitePico: e.limitePico, recuos: e.recuos, reducoesPorLentidao: e.reducoesPorLentidao, porRota: Object.fromEntries(Object.entries(rotas).sort((a, b) => b[1] - a[1]).slice(0, 6)) };
  await saveSnapshot(final);
  if (!final.parcial) await saveSnapshotCompleto(final);                 // só uma leitura que terminou vira o "último resultado completo"
  avisa({ estado: 'ok', fimEm: Date.now(), feito: r.qualidade.lidas, total: ativas, msg: `Leitura concluída: ${r.qualidade.lidas} empresas em ${duracao(ms)}` });
}
/** Releitura rápida: só as empresas prioritárias (treinadas), trocando as linhas delas no que já foi lido. */
async function leituraRapida(cfg, snap, avisa) {
  const guardado = (await st().get(CHAVE_CLIENTES))[CHAVE_CLIENTES];
  if (!guardado || !guardado.clientes) return;
  const raizes = raizesParaLer(cfg.trained);
  const alvo = guardado.clientes.filter(c => raizes.has(String(c.cnpj || '').slice(0, 8)) && !c.inativo && c.ids.length);
  if (!alvo.length) return;
  const { f } = criarFetcher();
  const equipeIds = await equipeSegura(f);
  avisa({ estado: 'rodando', feito: 0, total: alvo.length, msg: `Atualizando ${alvo.length} empresas treinadas…`, rapida: true });
  const r = await coletar(f, alvo, { limite: 0, pausa, conhecidas: cfg.allowedFolders, descer: DEPARTAMENTOS_LIDOS, paralelo: PARALELO, rapido: true, equipeIds,
    onProgresso: p => { batida(); avisa({ estado: 'rodando', feito: p.feito, total: p.total, msg: `Atualizando treinadas: ${p.feito} de ${p.total}`, rapida: true }); } });
  const atual = await loadSnapshot();
  const base = atual && atual.fonte === 'onvio' ? atual : snap;
  const novo = { ...base, docs: mesclarEmpresas(base.docs, r.docs, alvo.map(c => c.cnpj)), ver: { ...(base.ver || {}), ...(r.ver || {}) }, verEmpresa: { ...(base.verEmpresa || {}), ...(r.verEmpresa || {}) }, rapidaEm: Date.now() };
  await saveSnapshot(novo);
  if (!novo.lendo && !novo.parcial) await saveSnapshotCompleto(novo);
  avisa({ estado: 'ok', fimEm: Date.now(), feito: r.qualidade.lidas, total: alvo.length, msg: `Treinadas atualizadas: ${r.qualidade.lidas}`, rapida: true });
}

/** Notificações da equipe do escritório (poucas chamadas): lê toda a equipe e guarda só nome, estado e sim/não. Falha aqui não derruba a leitura das empresas. */
async function lerNotifs(cfg) {
  const { f } = criarFetcher();
  const r = await lerNotificacoesEscritorio(f, { pausa, campos: { email: cfg.notifCampoEmail, sistema: cfg.notifCampoSistema }, modelo: cfg.notifModelo });
  await st().set({ [CHAVE_NOTIF]: { fonte: 'onvio', em: Date.now(), total: r.total, campos: r.campos, modelo: r.modelo, itens: r.itens } });
}
export const CHAVE_NOTIF_ESTADO = 'monitor-notificacoes-estado';
let lendoNotif = false;
/** Leitura própria das notificações: não depende da leitura das empresas (nem da trava, nem do recuo de 30 min dela). */
export async function rodarNotifs() {
  if (lendoNotif) return;
  try {
    const cfg = await loadConfig();
    if (cfg.autoLer === false) return;
    const g = (await st().get(CHAVE_NOTIF))[CHAVE_NOTIF], e = (await st().get(CHAVE_NOTIF_ESTADO))[CHAVE_NOTIF_ESTADO];
    if (!precisaNotifs(g, cfg)) return;
    if (e && e.estado === 'lendo' && Date.now() - e.em < 3 * 60 * 1000) return;                  // outra aba está lendo
    if (e && e.estado !== 'lendo' && Date.now() - e.em < 5 * 60 * 1000) return;                  // falhou há pouco: espera 5 min
    lendoNotif = true;
    await st().set({ [CHAVE_NOTIF_ESTADO]: { estado: 'lendo', em: Date.now() } });
    const { f } = criarFetcher();
    try { const perfil = perfilDaSessao(await f(API + 'security/v1/session-and-bindings')); if (perfil === 'cliente') { await st().set({ [CHAVE_NOTIF_ESTADO]: { estado: 'cliente', em: Date.now(), msg: 'Acesso de cliente: não lê.' } }); return; } } catch (x) { /* só informativa */ }
    await lerNotifs(cfg);
    await st().set({ [CHAVE_NOTIF_ESTADO]: { estado: 'ok', em: Date.now() } });
  } catch (x) {
    try { await st().set({ [CHAVE_NOTIF_ESTADO]: { estado: x instanceof AuthError ? 'sem_sessao' : 'erro', em: Date.now(), msg: String(x && x.message || x).slice(0, 200) } }); } catch (y) { /* nada */ }
  } finally { lendoNotif = false; }
}
/** Treinados direto do Hub: com o código e o Hub aberto numa aba, a cada `horasAuto` (10 min depois de uma tentativa que não deu certo). */
export async function rodarTreinados() {
  try {
    const cfg = await loadConfig();
    if (!String(cfg.hubCodigo || '').trim() || cfg.hubAuto === false) return;
    const e = (await st().get(CHAVE_HUB_ESTADO))[CHAVE_HUB_ESTADO], agora = Date.now();
    if (e && agora - (e.em || 0) < (e.ok ? (cfg.horasAuto || 6) * 3600 * 1000 : 10 * 60 * 1000)) return;
    await puxarTreinados();
  } catch (x) { /* só os treinados falharam */ }
}
/**
 * Último uso do portal pelas Solicitações de Serviço, de TODAS as empresas (só as listas + os trâmites que precisam, ver solicitacoes.js):
 * a cada hora. O "último envio" só por arquivos não é confiável (empresa que só usa Solicitações parecia anos parada), então as duas fontes valem.
 * Falhar aqui não derruba o resto. Guarda só CNPJ -> data (monitor-solicitacoes); recuo de 10 min depois de uma falha.
 */
export const CHAVE_SOLIC = 'monitor-solicitacoes', CHAVE_SOLIC_ESTADO = 'monitor-solicitacoes-estado';
export const ESCOPO_SOLIC = 'todas-v2';
let lendoSolic = false;
export async function rodarSolicitacoes() {
  if (lendoSolic) return;
  try {
    const cfg = await loadConfig();
    if (cfg.autoLer === false) return;
    const g = (await st().get(CHAVE_SOLIC))[CHAVE_SOLIC], e = (await st().get(CHAVE_SOLIC_ESTADO))[CHAVE_SOLIC_ESTADO], agora = Date.now();
    if (g && g.escopo === ESCOPO_SOLIC && agora - (g.em || 0) < 3600 * 1000 && g.assinatura === assinaturaTreinadas(cfg.trained)) return;
    if (e && e.estado === 'lendo' && agora - e.em < 5 * 60 * 1000) return;
    if (e && e.estado !== 'lendo' && e.estado !== 'ok' && agora - e.em < 10 * 60 * 1000) return;
    const guardado = (await st().get(CHAVE_CLIENTES))[CHAVE_CLIENTES];
    if (!guardado || !guardado.clientes) return;       // a lista de clientes vem da leitura principal; sem ela as Solicitações esperam (nunca refaz a lista aqui)
    lendoSolic = true;
    await st().set({ [CHAVE_SOLIC_ESTADO]: { estado: 'lendo', em: agora } });
    const { f } = criarFetcher();
    try { if (perfilDaSessao(await f(API + 'security/v1/session-and-bindings')) === 'cliente') { await st().set({ [CHAVE_SOLIC_ESTADO]: { estado: 'cliente', em: Date.now() } }); return; } } catch (x) { /* só informativa */ }
    const ativos = guardado.clientes.filter(c => c.codigo && c.cnpj && !c.inativo);
    const codCnpj = {}; for (const c of ativos) codCnpj[String(c.codigo)] = c.cnpj;
    // treinadas: data exata (lê também as respostas do cliente); a empresa treinada vale pela raiz do CNPJ (todos os estabelecimentos do grupo)
    const raizes = raizesParaLer(cfg.trained);
    const precisos = ativos.filter(c => raizes.has(String(c.cnpj).slice(0, 8))).map(c => String(c.codigo));
    const dia = n => new Date(agora - n * 864e5).toISOString().slice(0, 10);
    const r = await lerEnviosPorSolicitacao(f, null, { desde: dia(730), recorte: dia(cfg.diasSemEnvio || 30), precisos, pausa });
    const porCnpjDia = {};
    for (const [cod, d] of Object.entries(r.porCodigo)) { const cnpj = codCnpj[cod]; if (cnpj && d > (porCnpjDia[cnpj] || '')) porCnpjDia[cnpj] = d; }
    const semCodigo = cfg.trained.filter(t => { const rs = raizesParaLer([t]); return !ativos.some(c => rs.has(String(c.cnpj).slice(0, 8))); }).length;
    await st().set({ [CHAVE_SOLIC]: { em: Date.now(), escopo: ESCOPO_SOLIC, assinatura: assinaturaTreinadas(cfg.trained), porCnpj: porCnpjDia, lidas: r.lidas, tramites: r.tramites, limitada: r.limitada, semAcesso: r.semAcesso, semCodigo } });
    await st().set({ [CHAVE_SOLIC_ESTADO]: { estado: 'ok', em: Date.now() } });
  } catch (x) {
    try { await st().set({ [CHAVE_SOLIC_ESTADO]: { estado: x instanceof AuthError ? 'sem_sessao' : 'erro', em: Date.now(), msg: String(x && x.message || x).slice(0, 200) } }); } catch (y) { /* nada */ }
  } finally { lendoSolic = false; }
}
export const precisaNotifs = (g, cfg, agora = Date.now()) => !g || agora - (g.em || 0) >= (cfg.horasAuto || 6) * 3600 * 1000;

export async function rodarAgora({ onEstado } = {}) {
  if (rodando) return;
  const avisa = e => { gravarEstado(e); if (onEstado) onEstado(e); };
  try {
    const cfg = await loadConfig(), snap = await loadSnapshot(), estado = (await st().get(CHAVE_ESTADO))[CHAVE_ESTADO];
    if (estado && estado.estado !== 'ok' && estado.estado !== 'rodando' && estado.fimEm && Date.now() - estado.fimEm < 30 * 60 * 1000) return;   // falhou há pouco: espera 30 min
    const completa = precisaColetar({ snapshot: snap, cfg, estado }), rapida = !completa && precisaRapida({ snapshot: snap, cfg });
    if (!completa && !rapida) return;
    rodando = true;
    if (!(await pegarTrava())) { rodando = false; return; }
    if (completa) await leituraCompleta(cfg, avisa); else if (rapida) await leituraRapida(cfg, snap, avisa);
  } catch (e) {
    avisa({ estado: e instanceof AuthError ? 'sem_sessao' : 'erro', fimEm: Date.now(), msg: String(e && e.message || e).slice(0, 200) });
    // a leitura parou: o que já foi lido fica, mas a tela não pode continuar dizendo "lendo ao vivo"
    try { const s = await loadSnapshot(); if (s && s.lendo) await saveSnapshot({ ...s, lendo: false, parcial: true, interrompida: true }); } catch (x) { /* só o aviso */ }
  } finally { rodando = false; await soltar(); }
}

/**
 * Um ciclo por vez, em fila, para nada disputar o Onvio com a leitura principal das empresas (que é a que importa e a mais pesada):
 * primeiro o que é leve e rápido (notificações da equipe e treinados do Hub), depois a leitura principal e SÓ DEPOIS os extras
 * (Solicitações e histórico). Se um ciclo ainda está rodando, o minuto seguinte espera: nada se acumula nem roda em paralelo.
 */
let cicloAtivo = false;
export async function ciclo(onEstado) {
  if (cicloAtivo) return;
  cicloAtivo = true;
  try {
    await rodarNotifs();
    await rodarTreinados();
    await rodarAgora({ onEstado });
    await rodarSolicitacoes();
    await rodarHistorico();
  } catch (e) { /* cada etapa já guarda o próprio erro; o ciclo seguinte tenta de novo */ }
  finally { cicloAtivo = false; }
}

/** Liga a leitura: começa 2 s depois de a página abrir e confere a cada minuto se há o que ler (completa a cada `horasAuto`, rápida a cada 10 min). */
export function iniciar({ onEstado, atrasoMs = 2000, cadaMs = 60 * 1000 } = {}) {
  setTimeout(() => ciclo(onEstado), atrasoMs);
  setInterval(() => ciclo(onEstado), cadaMs);
}
