// Leitura automática do Onvio, em segundo plano, a partir da própria página do Onvio (carregado por src/overlay.js).
// Sem clique: ao abrir uma página do Onvio (visão do escritório) e a cada 30 min, se os dados têm mais de `horasAuto`
// horas, lê as empresas uma de cada vez. SÓ LEITURA (mesma lista fechada de rotas). Para sozinha se o acesso for de cliente,
// se a sessão cair ou se o Onvio pedir calma. Uma trava impede duas abas lendo ao mesmo tempo.
import { guardar, coletar, listarClientes, perfilDaSessao, fetcherComFallback, precisaColetar, AuthError, API } from './onvio-reader.js';
import { loadConfig, DEPARTAMENTOS_LIDOS } from './config.js';
import { loadSnapshot, saveSnapshot } from './snapshot.js';

export const CHAVE_ESTADO = 'monitor-coleta-estado', CHAVE_TRAVA = 'monitor-coleta-trava';
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

let rodando = false;
export async function rodarAgora({ onEstado } = {}) {
  if (rodando) return;
  const avisa = e => { gravarEstado(e); if (onEstado) onEstado(e); };
  try {
    const cfg = await loadConfig();
    if (!precisaColetar({ snapshot: await loadSnapshot(), cfg, estado: (await st().get(CHAVE_ESTADO))[CHAVE_ESTADO] })) return;
    rodando = true;
    if (!(await pegarTrava())) { rodando = false; return; }
    avisa({ estado: 'rodando', feito: 0, total: 0, msg: 'Lendo a lista de empresas…' });
    const base = fetcherComFallback([{ via: 'página (mesma origem)', f: brutoIsolado }, { via: 'página do Onvio (mundo da página)', f: brutoPagina }]);
    const f = guardar(base);
    try { const perfil = perfilDaSessao(await f(API + 'security/v1/session-and-bindings')); if (perfil === 'cliente') { avisa({ estado: 'cliente', fimEm: Date.now(), msg: 'Acesso de cliente: não lê.' }); return; } } catch (e) { /* sessão é só informativa */ }
    const conhecidas = cfg.allowedFolders;
    const { clientes, falhaCnd } = await listarClientes(f, { pausa });
    const ativas = clientes.filter(c => !c.inativo && c.ids.length).length;
    const r = await coletar(f, clientes, { limite: 0, pausa, conhecidas, descer: DEPARTAMENTOS_LIDOS,
      onProgresso: p => { batida(); avisa({ estado: 'rodando', feito: p.feito, total: p.total, msg: `${p.feito} de ${p.total} empresas` }); } });
    await saveSnapshot({ fonte: 'onvio', coletadoEm: Date.now(), docs: r.docs, totalEmpresas: ativas, qualidade: r.qualidade, parcial: false, falhaCnd: falhaCnd || '', auto: true, via: base.via || '' });
    avisa({ estado: 'ok', fimEm: Date.now(), feito: r.qualidade.lidas, total: ativas, msg: `Leitura concluída: ${r.qualidade.lidas} empresas` });
  } catch (e) {
    avisa({ estado: e instanceof AuthError ? 'sem_sessao' : 'erro', fimEm: Date.now(), msg: String(e && e.message || e).slice(0, 200) });
  } finally { rodando = false; await soltar(); }
}

/** Liga a leitura automática: 1ª tentativa pouco depois de a página abrir e depois a cada 30 min. */
export function iniciar({ onEstado, atrasoMs = 8000, cadaMs = 30 * 60 * 1000 } = {}) {
  setTimeout(() => rodarAgora({ onEstado }), atrasoMs);
  setInterval(() => rodarAgora({ onEstado }), cadaMs);
}
