// Leitura automática dos funcionários do Gestta (notificações), em segundo plano, a partir da própria página do Gestta.
// A cada 60 min (ou quando não há dados). Não pré-julga o papel da pessoa: tenta ler e, se o Gestta recusar (403), diz que falta acesso. SÓ LEITURA, lista fechada.
// O token nunca sai da página; só os dados limpos são guardados (nome, setor, tarefas ativas e o sim/não da notificação).
import { criarLeitor, lerFuncionarios, GESTTA_API } from './gestta-reader.js';
import { buscarGestta } from './gestta-pagina.js';
import { AuthError } from './onvio-reader.js';
import { loadConfig } from './config.js';

export const CHAVE_GESTTA = 'monitor-gestta', CHAVE_ESTADO_GESTTA = 'monitor-gestta-estado', CHAVE_TRAVA_GESTTA = 'monitor-gestta-trava';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const st = () => chrome.storage.local, idAba = Math.random().toString(36).slice(2);
const gravarEstado = e => st().set({ [CHAVE_ESTADO_GESTTA]: { ...e, em: Date.now() } }).catch(() => {});
async function pegarTrava() {
  const t = (await st().get(CHAVE_TRAVA_GESTTA))[CHAVE_TRAVA_GESTTA];
  if (t && t.id !== idAba && Date.now() - t.em < 3 * 60 * 1000) return false;
  await st().set({ [CHAVE_TRAVA_GESTTA]: { id: idAba, em: Date.now() } }); await pausa(400);
  return ((await st().get(CHAVE_TRAVA_GESTTA))[CHAVE_TRAVA_GESTTA] || {}).id === idAba;
}
const soltar = async () => { try { const t = (await st().get(CHAVE_TRAVA_GESTTA))[CHAVE_TRAVA_GESTTA]; if (t && t.id === idAba) await st().remove(CHAVE_TRAVA_GESTTA); } catch (e) { /* nada */ } };
const temToken = () => { try { return /^JWT\s+\S+/.test(JSON.parse(localStorage.getItem('ngStorage-jwt') || 'null')); } catch (e) { return false; } };

let rodando = false;
export async function rodarGestta() {
  if (rodando || !temToken()) return;
  try {
    const cfg = await loadConfig(); if (cfg.autoLer === false) return;
    const snap = (await st().get(CHAVE_GESTTA))[CHAVE_GESTTA], estado = (await st().get(CHAVE_ESTADO_GESTTA))[CHAVE_ESTADO_GESTTA];
    if (estado && estado.estado !== 'ok' && estado.estado !== 'rodando' && estado.fimEm && Date.now() - estado.fimEm < 30 * 60 * 1000) return;
    const campoMudou = snap && (cfg.gesttaCampo || '') !== (snap.campoConfigurado || '');
    if (snap && !campoMudou && Date.now() - snap.coletadoEm < 60 * 60 * 1000) return;
    rodando = true;
    if (!(await pegarTrava())) { rodando = false; return; }
    const leitor = criarLeitor((m, u, c) => buscarGestta(m, u, c));
    gravarEstado({ estado: 'rodando', feito: 0, total: 0, msg: 'Lendo os funcionários do Gestta…' });
    const r = await lerFuncionarios(leitor, { campo: cfg.gesttaCampo || '', pausa, onProgresso: p => gravarEstado({ estado: 'rodando', feito: p.feito, total: p.total, msg: `Gestta: ${p.feito} de ${p.total} funcionários` }) });
    await st().set({ [CHAVE_GESTTA]: { coletadoEm: Date.now(), users: r.users, campo: r.campo, campoConfigurado: cfg.gesttaCampo || '', candidatos: r.candidatos, qualidade: r.qualidade } });
    gravarEstado({ estado: 'ok', fimEm: Date.now(), feito: r.users.length, total: r.users.length, msg: `Gestta lido: ${r.users.length} funcionários` });
  } catch (e) {
    const semAcesso = e instanceof AuthError && /não inclui/.test(e.message);          // o Gestta recusou o cadastro de funcionários (403)
    gravarEstado({ estado: semAcesso ? 'sem_acesso' : e instanceof AuthError ? 'sem_sessao' : 'erro', fimEm: Date.now(), msg: String(e && e.message || e).slice(0, 200) });
  }
  finally { rodando = false; await soltar(); }
}
export function iniciar({ atrasoMs = 3000, cadaMs = 60 * 1000 } = {}) { setTimeout(rodarGestta, atrasoMs); setInterval(rodarGestta, cadaMs); }
