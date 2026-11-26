// Correção de nomes de arquivo, parte 2: ESCREVER no Onvio. Única escrita permitida, mapeada em 26/11/2026 pelo modo aprender
// (docs/mapear-renomear-arquivo.md): PUT storage/v1/folders/{pasta}/documents/{arquivo} com o corpo { name, id, containerId }.
// Travas: só renomear (nunca excluir, mover ou criar); só nome que passa no padrão; um arquivo por vez; confere antes que o nome atual
// ainda é o lido; para na primeira recusa de permissão (401/403) e depois de 3 erros seguidos; registra o nome antigo para desfazer.
import { API } from './onvio-reader.js';

const ID = '[0-9a-zA-Z-]{1,64}';
const ROTA_RENOMEAR = new RegExp(`^storage/v1/folders/(${ID})/documents/(${ID})$`);
const ROTA_METADADOS = new RegExp(`^storage/v1/folders/(${ID})/documents/(${ID})/metadata$`);

/** Pedido de renomear um arquivo (ainda não enviado). */
export function pedidoRenomear({ pastaId, docId, novoNome }) {
  return { metodo: 'PUT', url: `${API}storage/v1/folders/${encodeURIComponent(pastaId)}/documents/${encodeURIComponent(docId)}`, corpo: { name: String(novoNome), id: String(docId), containerId: String(pastaId) } };
}
export const urlMetadados = (pastaId, docId) => `${API}storage/v1/folders/${encodeURIComponent(pastaId)}/documents/${encodeURIComponent(docId)}/metadata?LoadItemMetadata=true`;

/** Lista fechada de escrita: só PUT de renomear, só no onvio.com.br, e o corpo só com name, id e containerId coerentes com a rota. */
export function escritaPermitida(p) {
  if (!p || p.metodo !== 'PUT' || typeof p.url !== 'string') return false;
  let u; try { u = new URL(p.url); } catch (e) { return false; }
  if (u.origin !== 'https://onvio.com.br' || !u.pathname.startsWith('/api/') || u.search) return false;
  const m = ROTA_RENOMEAR.exec(decodeURIComponent(u.pathname.slice(5)));
  if (!m) return false;
  const c = p.corpo;
  if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'containerId,id,name') return false;
  return c.containerId === m[1] && c.id === m[2] && typeof c.name === 'string' && c.name.trim() !== '' && c.name.length <= 255 && !/[\\/]/.test(c.name);
}
/** Leitura de conferência (só dos metadados do arquivo a renomear). */
export const leituraDeConferencia = url => { try { const u = new URL(url); return u.origin === 'https://onvio.com.br' && ROTA_METADADOS.test(u.pathname.slice(5)); } catch (e) { return false; } };

const dorme = ms => new Promise(r => setTimeout(r, ms));
export const MOTIVOS_FALHA = {
  'mudou': 'O arquivo mudou no Onvio desde a leitura (nome ou pasta); não foi alterado',
  'fora-do-padrao': 'O nome novo não passa no padrão; não foi alterado',
  'raiz-do-projeto': 'Arquivo na raiz do projeto: a rota de renomear só foi mapeada para pastas',
  'sem-id': 'Sem identificador do arquivo',
  'recusado': 'O Onvio recusou a alteração',
  'sem-permissao': 'O Onvio recusou por falta de permissão (401/403): parei',
};

/**
 * Corrige os itens um por vez. `ler(url)` devolve o JSON; `escrever(pedido)` devolve { status }.
 * itens: [{ docId, pastaId, pastaTipo, arquivo, novo, empresa, cnpj }]. `padrao`: RegExp do padrão de nome.
 * Devolve { feitos: [{ docId, pastaId, empresa, cnpj, de, para }], falhas: [{ ..., motivo }], parou: '' | 'sem-permissao' | 'erros' | 'pedido' }.
 */
export async function corrigirNomes(itens, { ler, escrever, padrao, parar, onProgresso, pausaMs = 250 } = {}) {
  const feitos = [], falhas = []; let parou = '', seguidos = 0, n = 0;
  for (const it of itens) {
    if (parar && parar()) { parou = 'pedido'; break; }
    n++;
    const falha = motivo => { falhas.push({ ...it, motivo }); };
    if (!it.docId || !it.pastaId) { falha('sem-id'); continue; }
    if (it.pastaTipo && it.pastaTipo !== 'Folders') { falha('raiz-do-projeto'); continue; }
    if (!padrao || !padrao.test(it.novo)) { falha('fora-do-padrao'); continue; }
    const pedido = pedidoRenomear({ pastaId: it.pastaId, docId: it.docId, novoNome: it.novo });
    if (!escritaPermitida(pedido)) { falha('fora-do-padrao'); continue; }
    try {
      const url = urlMetadados(it.pastaId, it.docId);
      if (!leituraDeConferencia(url)) { falha('mudou'); continue; }
      const meta = await ler(url), d = (meta && (meta.data || meta)) || {};
      if (String(d.name) !== String(it.arquivo) || (d.containerId != null && String(d.containerId) !== String(it.pastaId))) { falha('mudou'); continue; }
    } catch (e) { falha('mudou'); continue; }
    const r = await escrever(pedido);
    if (r && r.status >= 200 && r.status < 300) { feitos.push({ docId: it.docId, pastaId: it.pastaId, empresa: it.empresa, cnpj: it.cnpj, pasta: it.pasta || '', de: it.arquivo, para: it.novo }); seguidos = 0; }
    else if (r && (r.status === 401 || r.status === 403)) { falha('sem-permissao'); parou = 'sem-permissao'; break; }
    else { falha('recusado'); if (++seguidos >= 3) { parou = 'erros'; break; } }
    if (onProgresso) onProgresso({ feito: n, total: itens.length, ok: feitos.length });
    if (pausaMs) await dorme(pausaMs);
  }
  return { feitos, falhas, parou };
}

/** Desfaz uma rodada: volta cada nome antigo, só se o arquivo ainda tem o nome novo. Mesmas travas. */
export async function desfazerNomes(feitos, opcoes = {}) {
  const itens = feitos.slice().reverse().map(f => ({ docId: f.docId, pastaId: f.pastaId, pastaTipo: 'Folders', arquivo: f.para, novo: f.de, empresa: f.empresa, cnpj: f.cnpj, pasta: f.pasta }));
  return corrigirNomes(itens, { ...opcoes, padrao: { test: () => true } });       // voltar ao nome antigo não precisa passar no padrão (o antigo estava fora dele)
}
