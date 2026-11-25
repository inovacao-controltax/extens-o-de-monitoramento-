// Mantém o histórico em dia sem abrir o painel: a cada leitura nova, compara as pendências com as da vez anterior (fase 6).
import { loadConfig } from './config.js';
import { loadSnapshot, loadSnapshotCompleto, snapshotEstavel } from './snapshot.js';
import { analyze } from './rules.js';
import { CHAVE_HIST, atualizarHistorico } from './historico.js';
import { assinaturaTreinadas } from './solicitacoes.js';

const st = () => chrome.storage.local;
let rodando = false;
export async function rodarHistorico() {
  if (rodando) return;
  rodando = true;
  try {
    const cfg = await loadConfig(), snap = snapshotEstavel(await loadSnapshot(), await loadSnapshotCompleto());   // lendo: compara com a última completa, nunca com um parcial
    const r = await st().get(['monitor-notificacoes', 'monitor-solicitacoes', CHAVE_HIST]);
    const notif = r['monitor-notificacoes'] || null, solic = r['monitor-solicitacoes'] || null, h = r[CHAVE_HIST] || null;
    const real = snap && snap.fonte === 'onvio' && !snap.lendo && snap.qualidade && snap.qualidade.lidas > 0;
    const fontes = [real ? Math.max(snap.coletadoEm || 0, snap.rapidaEm || 0) : 0, notif ? notif.em : 0, solic ? solic.em : 0, (cfg.trained || []).length, cfg.diasSemEnvio, JSON.stringify(cfg.silenciadas || [])].join('|');
    if (h && h.fontes === fontes) return;                       // nada mudou desde a última conta
    const prontos = new Set();
    if (real) { prontos.add('nomenclatura'); prontos.add('pastas'); }
    if (real && (cfg.trained || []).length && solic && solic.escopo === 'todas-v2' && solic.assinatura === assinaturaTreinadas(cfg.trained)) prontos.add('semEnvio');   // sem as Solicitações lidas, "sem envio" daria alarme falso
    if (notif) prontos.add('notificacoes');
    if (!prontos.size) return;
    const R = analyze({ docs: real ? snap.docs : [], trained: [], notif, solic: solic && solic.porCnpj, users: [] }, cfg);
    await st().set({ [CHAVE_HIST]: atualizarHistorico(h, R, new Date(), { prontos, fontes }) });
  } catch (e) { /* o histórico é um extra: nunca derruba a leitura */ }
  finally { rodando = false; }
}
