// Correção de pastas fora do padrão, parte 3: enviar para a LIXEIRA do Onvio as pastas (projetos) de primeiro nível que estão fora do padrão e VAZIAS.
// Chamada mapeada em 26/11/2026 pelo modo aprender: POST storage/v1/trash/projects com o corpo { id } (vai para a lixeira, não apaga de vez).
// Travas: só esse POST, só { id }; só pasta que o Onvio diz VAZIA agora (relê o projeto antes: nome igual, hasChildren === false, permissions.delete === true);
// confirmação por nome de pasta; uma por vez; só 1 na primeira vez; para na primeira recusa 401/403 e depois de 3 erros seguidos; registro; nunca pasta com conteúdo.
import { API } from './onvio-reader.js';

const ID = '[0-9a-zA-Z-]{1,64}';
const ROTA_LIXEIRA = 'storage/v1/trash/projects';
const ROTA_PROJETO = new RegExp(`^storage/v1/projects/(${ID})$`);

/** Nomes de pasta que o Josué liberou para ir à lixeira MESMO com conteúdo (26/11/2026: a zlkx-c é dele). Qualquer outro nome só vai se estiver vazio. */
export const NOMES_COM_CONTEUDO = ['zlkx-c'];
export const liberadoComConteudo = (nome, lista = NOMES_COM_CONTEUDO) => lista.some(n => String(n).toLowerCase() === String(nome).toLowerCase());
export const pedidoLixeira = ({ projetoId }) => ({ metodo: 'POST', url: `${API}${ROTA_LIXEIRA}`, corpo: { id: String(projetoId) } });
export const urlProjeto = projetoId => `${API}storage/v1/projects/${encodeURIComponent(projetoId)}`;

/** Lista fechada: só o POST da lixeira de projetos, só no onvio.com.br, corpo só com { id }. */
export function lixeiraPermitida(p) {
  if (!p || p.metodo !== 'POST' || typeof p.url !== 'string') return false;
  let u; try { u = new URL(p.url); } catch (e) { return false; }
  if (u.origin !== 'https://onvio.com.br' || u.pathname !== `/api/${ROTA_LIXEIRA}` || u.search) return false;
  const c = p.corpo;
  return !!c && typeof c === 'object' && Object.keys(c).join() === 'id' && typeof c.id === 'string' && new RegExp(`^${ID}$`).test(c.id);
}
export const leituraDeProjeto = url => { try { const u = new URL(url); return u.origin === 'https://onvio.com.br' && ROTA_PROJETO.test(u.pathname.slice(5)); } catch (e) { return false; } };

const dorme = ms => new Promise(r => setTimeout(r, ms));
export const MOTIVOS_PASTA = {
  'mudou': 'A pasta mudou no Onvio desde a leitura (nome); não foi enviada',
  'com-conteudo': 'A pasta tem conteúdo agora; não foi enviada',
  'sem-permissao-excluir': 'O seu usuário não pode excluir esta pasta; não foi enviada',
  'sem-id': 'Sem identificador da pasta',
  'recusado': 'O Onvio recusou',
  'sem-permissao': 'O Onvio recusou por falta de permissão (401/403): parei',
};

/**
 * Pastas elegíveis de "Pastas fora do padrão": só projeto de primeiro nível que o Onvio disse estar vazio. Agrupadas por NOME da pasta.
 * [{ nome, itens: [{ pastaId, empresa, cnpj, pasta }], comConteudo, naoVerificadas }]
 */
export function gruposExcluiveis(linhas) {
  const por = new Map();
  for (const l of linhas || []) {
    if (l.pastaTipo !== 'Projects') continue;
    const k = String(l.pasta).toLowerCase(), g = por.get(k) || por.set(k, { nome: l.pasta, itens: [], itensComConteudo: [], comConteudo: 0, naoVerificadas: 0 }).get(k);
    const item = { pastaId: l.pastaId, empresa: l.empresa, cnpj: l.cnpj, pasta: l.pasta };
    if (l.vazia === true && l.pastaId && l.podeExcluir !== false) g.itens.push(item);
    else if (l.vazia === false) { g.comConteudo++; if (l.pastaId && l.podeExcluir !== false) g.itensComConteudo.push(item); }      // só vai se o nome estiver liberado (ver abaixo)
    else g.naoVerificadas++;
  }
  return [...por.values()].filter(g => g.itens.length || g.comConteudo || g.naoVerificadas).sort((a, b) => b.itens.length - a.itens.length);
}

/**
 * Envia para a lixeira, uma por vez. `ler(url)` devolve o JSON; `escrever(pedido)` devolve { status }.
 * Devolve { feitos: [{ pastaId, empresa, cnpj, nome }], falhas: [{ ..., motivo }], parou }.
 */
export async function enviarPastasParaLixeira(itens, { ler, escrever, parar, onProgresso, pausaMs = 250, incluirConteudo = false } = {}) {
  const feitos = [], falhas = []; let parou = '', seguidos = 0, n = 0;
  for (const it of itens) {
    if (parar && parar()) { parou = 'pedido'; break; }
    n++;
    const falha = motivo => { falhas.push({ ...it, motivo }); };
    if (!it.pastaId) { falha('sem-id'); continue; }
    const pedido = pedidoLixeira({ projetoId: it.pastaId });
    if (!lixeiraPermitida(pedido)) { falha('sem-id'); continue; }
    try {
      const url = urlProjeto(it.pastaId);
      if (!leituraDeProjeto(url)) { falha('mudou'); continue; }
      const r = await ler(url), d = (r && (r.data || r)) || {};
      if (String(d.name) !== String(it.pasta)) { falha('mudou'); continue; }
      if (typeof d.hasChildren !== 'boolean') { falha('com-conteudo'); continue; }        // o Onvio tem de dizer, com clareza, se está vazia ou não
      if (d.hasChildren === true && !incluirConteudo) { falha('com-conteudo'); continue; }   // com conteúdo só com a liberação explícita do nome
      if (!d.permissions || d.permissions.delete !== true) { falha('sem-permissao-excluir'); continue; }
    } catch (e) { falha('mudou'); continue; }
    const r = await escrever(pedido);
    if (r && r.status >= 200 && r.status < 300) { feitos.push({ pastaId: it.pastaId, empresa: it.empresa, cnpj: it.cnpj, nome: it.pasta }); seguidos = 0; }
    else if (r && (r.status === 401 || r.status === 403)) { falha('sem-permissao'); parou = 'sem-permissao'; break; }
    else { falha('recusado'); if (++seguidos >= 3) { parou = 'erros'; break; } }
    if (onProgresso) onProgresso({ feito: n, total: itens.length, ok: feitos.length });
    if (pausaMs) await dorme(pausaMs);
  }
  return { feitos, falhas, parou };
}
