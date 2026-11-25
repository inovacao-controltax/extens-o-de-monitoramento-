// Leitura do Onvio AO VIVO, em segundo plano, a partir da própria página do Onvio (carregado por src/overlay.js).
// Sem clique: assim que uma página do Onvio (visão do escritório) abre, a extensão lê as empresas 4 de cada vez, as TREINADAS PRIMEIRO,
// e entrega dados parciais ao painel a cada poucos segundos (o painel cresce enquanto lê). Terminada a leitura completa, relê só as
// empresas prioritárias a cada 10 min e a leitura completa a cada `horasAuto`. SÓ LEITURA (mesma lista fechada de rotas).
// Para sozinha com acesso de cliente, se a sessão cair ou se o Onvio pedir calma. Uma trava impede duas abas lendo ao mesmo tempo.
import { guardar, coletar, listarClientes, perfilDaSessao, fetcherComFallback, precisaColetar, precisaRapida, mesclarEmpresas, lerNotificacoesEscritorio, AuthError, API } from './onvio-reader.js';
import { loadConfig, DEPARTAMENTOS_LIDOS } from './config.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';

export const CHAVE_ESTADO = 'monitor-coleta-estado', CHAVE_TRAVA = 'monitor-coleta-trava', CHAVE_CLIENTES = 'monitor-clientes';
export const CHAVE_NOTIF = 'monitor-notificacoes';
const PARALELO = 4;
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
const criarFetcher = () => { const base = fetcherComFallback([{ via: 'página (mesma origem)', f: brutoIsolado }, { via: 'página do Onvio (mundo da página)', f: brutoPagina }]); return { base, f: guardar(base) }; };
const compactos = cl => cl.map(c => ({ ids: c.ids, codigo: c.codigo, nome: c.nome, cnpj: c.cnpj, inativo: c.inativo }));

let rodando = false;
/** Leitura completa (ao vivo). */
async function leituraCompleta(cfg, avisa) {
  const { base, f } = criarFetcher();
  try { const perfil = perfilDaSessao(await f(API + 'security/v1/session-and-bindings')); if (perfil === 'cliente') { avisa({ estado: 'cliente', fimEm: Date.now(), msg: 'Acesso de cliente: não lê.' }); return; } } catch (e) { /* sessão é só informativa */ }
  avisa({ estado: 'rodando', feito: 0, total: 0, msg: 'Lendo a lista de empresas…' });
  const { clientes, falhaCnd } = await listarClientes(f, { pausa, onLista: l => avisa({ estado: 'rodando', feito: 0, total: 0, msg: `Lendo a lista de empresas… ${l.lidos}${l.total ? ' de ' + l.total : ''}` }) });
  try { await st().set({ [CHAVE_CLIENTES]: { em: Date.now(), clientes: compactos(clientes) } }); } catch (e) { /* cache é só para a releitura rápida */ }
  const ativas = clientes.filter(c => !c.inativo && c.ids.length).length;
  const prioridade = new Set((cfg.trained || []).map(t => t.cnpj));
  const montar = (r, parcial) => ({ fonte: 'onvio', coletadoEm: Date.now(), docs: r.docs, totalEmpresas: ativas, qualidade: r.qualidade, parcial, lendo: parcial, falhaCnd: falhaCnd || '', auto: true, via: base.via || '' });
  avisa({ estado: 'rodando', feito: 0, total: ativas, msg: `0 de ${ativas} empresas` });
  const r = await coletar(f, clientes, { limite: 0, pausa, conhecidas: cfg.allowedFolders, descer: DEPARTAMENTOS_LIDOS, paralelo: PARALELO, prioridade,
    onProgresso: p => { batida(); avisa({ estado: 'rodando', feito: p.feito, total: p.total, msg: `${p.feito} de ${p.total} empresas` }); },
    onParcial: async p => { await saveSnapshot(montar(p, true)); } });
  await saveSnapshot(montar(r, !!r.qualidade.interrompida));
  avisa({ estado: 'ok', fimEm: Date.now(), feito: r.qualidade.lidas, total: ativas, msg: `Leitura concluída: ${r.qualidade.lidas} empresas` });
}
/** Releitura rápida: só as empresas prioritárias (treinadas), trocando as linhas delas no que já foi lido. */
async function leituraRapida(cfg, snap, avisa) {
  const guardado = (await st().get(CHAVE_CLIENTES))[CHAVE_CLIENTES];
  if (!guardado || !guardado.clientes) return;
  const prioridade = new Set(cfg.trained.map(t => t.cnpj));
  const alvo = guardado.clientes.filter(c => prioridade.has(c.cnpj) && !c.inativo && c.ids.length);
  if (!alvo.length) return;
  const { f } = criarFetcher();
  avisa({ estado: 'rodando', feito: 0, total: alvo.length, msg: `Atualizando ${alvo.length} empresas treinadas…`, rapida: true });
  const r = await coletar(f, alvo, { limite: 0, pausa, conhecidas: cfg.allowedFolders, descer: DEPARTAMENTOS_LIDOS, paralelo: PARALELO,
    onProgresso: p => { batida(); avisa({ estado: 'rodando', feito: p.feito, total: p.total, msg: `Atualizando treinadas: ${p.feito} de ${p.total}`, rapida: true }); } });
  const atual = await loadSnapshot();
  const base = atual && atual.fonte === 'onvio' ? atual : snap;
  await saveSnapshot({ ...base, docs: mesclarEmpresas(base.docs, r.docs, alvo.map(c => c.cnpj)), rapidaEm: Date.now() });
  avisa({ estado: 'ok', fimEm: Date.now(), feito: r.qualidade.lidas, total: alvo.length, msg: `Treinadas atualizadas: ${r.qualidade.lidas}`, rapida: true });
}

/** Notificações da equipe do escritório (poucas chamadas): lê toda a equipe e guarda só nome, estado e sim/não. Falha aqui não derruba a leitura das empresas. */
async function lerNotifs(cfg) {
  const { f } = criarFetcher();
  const r = await lerNotificacoesEscritorio(f, { pausa, campos: { email: cfg.notifCampoEmail, sistema: cfg.notifCampoSistema } });
  await st().set({ [CHAVE_NOTIF]: { fonte: 'onvio', em: Date.now(), total: r.total, campos: r.campos, itens: r.itens } });
}
export const precisaNotifs = (g, cfg, agora = Date.now()) => !g || agora - (g.em || 0) >= (cfg.horasAuto || 6) * 3600 * 1000;

export async function rodarAgora({ onEstado } = {}) {
  if (rodando) return;
  const avisa = e => { gravarEstado(e); if (onEstado) onEstado(e); };
  try {
    const cfg = await loadConfig(), snap = await loadSnapshot(), estado = (await st().get(CHAVE_ESTADO))[CHAVE_ESTADO];
    if (estado && estado.estado !== 'ok' && estado.estado !== 'rodando' && estado.fimEm && Date.now() - estado.fimEm < 30 * 60 * 1000) return;   // falhou há pouco: espera 30 min
    const completa = precisaColetar({ snapshot: snap, cfg, estado }), rapida = !completa && precisaRapida({ snapshot: snap, cfg });
    const notif = precisaNotifs((await st().get(CHAVE_NOTIF))[CHAVE_NOTIF], cfg);
    if (!completa && !rapida && !notif) return;
    rodando = true;
    if (!(await pegarTrava())) { rodando = false; return; }
    // as notificações são poucas chamadas: vêm ANTES da leitura longa das empresas, para a aba não ficar vazia por minutos
    if (notif) { try { await lerNotifs(cfg); } catch (e) { if (e instanceof AuthError) throw e; /* só as notificações falharam */ } }
    if (completa) await leituraCompleta(cfg, avisa); else if (rapida) await leituraRapida(cfg, snap, avisa);
  } catch (e) {
    avisa({ estado: e instanceof AuthError ? 'sem_sessao' : 'erro', fimEm: Date.now(), msg: String(e && e.message || e).slice(0, 200) });
  } finally { rodando = false; await soltar(); }
}

/** Liga a leitura: começa 2 s depois de a página abrir e confere a cada minuto se há o que ler (completa a cada `horasAuto`, rápida a cada 10 min). */
export function iniciar({ onEstado, atrasoMs = 2000, cadaMs = 60 * 1000 } = {}) {
  setTimeout(() => rodarAgora({ onEstado }), atrasoMs);
  setInterval(() => rodarAgora({ onEstado }), cadaMs);
}
