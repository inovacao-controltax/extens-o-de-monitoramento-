// Lista de clientes treinados puxada direto do Control Hub (Hub 432). O Hub só manda as empresas 100% treinadas e com contato;
// aqui a resposta vira a lista de treinados da configuração (o Hub é a fonte: a lista inteira é trocada).
import { normalizeCnpj, isValidCnpj, SETORES, loadConfig, saveConfig } from './config.js';

export const CHAVE_HUB_ESTADO = 'monitor-hub-estado';
const st = () => chrome.storage.local;

/** Resposta do Hub -> linhas da configuração (CNPJ válido, setores conhecidos, data AAAA-MM-DD ou vazia). */
export function treinadosParaConfig(lista) {
  const rows = [], descartadas = [], vistos = new Set();
  for (const x of Array.isArray(lista) ? lista : []) {
    const cnpj = normalizeCnpj(x && x.cnpj);
    if (!isValidCnpj(cnpj)) { descartadas.push(String((x && x.empresa) || '?')); continue; }
    if (vistos.has(cnpj)) continue; vistos.add(cnpj);
    const demanda = (Array.isArray(x.demanda) ? x.demanda : []).filter(s => SETORES.includes(s));
    rows.push({ empresa: String(x.empresa || '').slice(0, 200), cnpj, treinadoEm: /^\d{4}-\d{2}-\d{2}$/.test(String(x.treinadoEm)) ? x.treinadoEm : '', demanda });
  }
  return { rows, descartadas };
}
export const MOTIVOS = {
  'sem-codigo': 'Cole o código de pareamento do Hub em Configurações.',
  'sem-hub': 'Abra o Control Hub numa aba do claude.ai (logado) e tente de novo.',
  'sem-ponte': 'A aba do Hub está aberta, mas precisa ser recarregada (F5) para a extensão enxergá-la.',
  'token': 'O Hub recusou o código de pareamento. Confira se é o mesmo que aparece no Hub.',
  'sem-resposta': 'O Hub não respondeu a tempo. Tente de novo.',
  'versao-antiga': 'O Hub publicado ainda não tem a ligação com esta extensão (Hub 432 ou mais novo).',
  'acao': 'O Hub publicado ainda não tem esta função (precisa do Hub 435 ou mais novo para os contatos).',
  'recusado': 'Pedido recusado.',
};
const msg = r => MOTIVOS[r.motivo] || r.mensagem || `Não deu certo (${r.motivo || 'erro'}).`;

/** Pergunta ao Hub (via claude.ai aberto) e troca a lista de treinados. Devolve { ok, n, msg }. */
export async function puxarTreinados() {
  const grava = async e => { const x = { ...e, em: Date.now() }; try { await st().set({ [CHAVE_HUB_ESTADO]: x }); } catch (y) { /* sem storage */ } return x; };
  try {
    const cfg = await loadConfig();
    if (!String(cfg.hubCodigo || '').trim()) return grava({ ok: false, motivo: 'sem-codigo', msg: MOTIVOS['sem-codigo'] });
    const r = await chrome.runtime.sendMessage({ tipo: 'puxar-treinados' });
    if (!r || !r.ok) return grava({ ok: false, motivo: (r && r.motivo) || 'erro', msg: msg(r || {}) });
    const { rows, descartadas } = treinadosParaConfig(r.treinados);
    // Nunca troca uma lista que existe por uma vazia: se o Hub não devolveu nenhuma empresa (ainda carregando, sem permissão...), mantém a atual.
    if (!rows.length) return grava({ ok: false, motivo: 'vazia', msg: 'O Hub não devolveu nenhuma empresa 100% treinada. Mantive a lista atual; confira se o Hub terminou de carregar e tente de novo.' });
    const nova = { ...(await loadConfig()), trained: rows };
    const s = await saveConfig(nova);
    if (!s.ok) return grava({ ok: false, motivo: 'salvar', msg: 'Não foi possível salvar a lista.' });
    return grava({ ok: true, n: rows.length, descartadas: descartadas.length, msg: `${rows.length} empresas 100% treinadas${descartadas.length ? `, ${descartadas.length} sem CNPJ válido` : ''}.` });
  } catch (e) { return grava({ ok: false, motivo: 'erro', msg: String(e && e.message || e).slice(0, 160) }); }
}

/** Contatos do grupo da empresa no Hub (para o aviso). Devolve { ok, contatos, msg }. Nada é guardado. */
export async function contatosDoHub(cnpj) {
  try {
    const cfg = await loadConfig();
    if (!String(cfg.hubCodigo || '').trim()) return { ok: false, motivo: 'sem-codigo', msg: MOTIVOS['sem-codigo'] };
    const raiz = normalizeCnpj(cnpj).slice(0, 8);
    const r = await chrome.runtime.sendMessage({ tipo: 'puxar-contatos', raiz });
    if (!r || !r.ok) return { ok: false, motivo: (r && r.motivo) || 'erro', msg: msg(r || {}) };
    return { ok: true, contatos: r.contatos || [] };
  } catch (e) { return { ok: false, motivo: 'erro', msg: String(e && e.message || e).slice(0, 160) }; }
}
