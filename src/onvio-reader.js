// Leitor do Onvio (Fase 4c). SÓ LEITURA: GET numa lista fechada de rotas, dentro da sessão do usuário do escritório.
// Rotas e formatos seguem o mapeamento do Control Onvio (portal-do-cliente.md, hub-envio-completo). Tudo que o Onvio
// pode ter mudado falha de forma visível (diagnóstico), nunca vira número errado em silêncio.
// O "fetcher" é injetado: no navegador vem da aba do Onvio (src/onvio-tab.js); nos testes é uma API simulada.

export const API = 'https://onvio.com.br/api/';
const PERMITIDAS = [
  /^security\/v1\/session-and-bindings$/i,
  /^br-payroll-sr\/v1\/clients$/i,
  /^cnd\/v1\/clients$/i,
  /^storage\/v1\/projects$/i,
  /^storage\/v2\/(Projects|Folders)\/[^/]+\/children$/i,
];
export class AuthError extends Error {}

/** Só estas rotas, só no onvio.com.br. Qualquer outra recusa antes de sair da extensão. */
export function leituraPermitida(url) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (u.origin !== 'https://onvio.com.br' || !u.pathname.startsWith('/api/')) return false;
  const caminho = u.pathname.slice(5);
  return PERMITIDAS.some(r => r.test(caminho));
}
export const guardar = fetcher => async url => {
  if (!leituraPermitida(url)) throw new Error('leitura não permitida: ' + String(url).slice(0, 80));
  return fetcher(url);
};

const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const listaDe = d => Array.isArray(d) ? d : (d && (d.items || d.content || (d.data && (d.data.items || d.data)))) || [];
const nomeDe = x => String((x && (x.name || x.title || x.displayName)) || '');
export const ehPasta = x => !!x && (/folder|container|project/i.test(String(x.itemType || x.type || '')) ||
  (x.itemType == null && x.type == null && !x.mimeType && !x.documentType && x.originalItemSize == null));

// ---------- Perfil: só a visão do escritório ----------
const CHAVE_TIPO = /^(user)?(type|kind|role|roles|profile|perfil|tipo|audience|usertype|accounttype|persona|context|product|application|app)$/i;
const EH_CLIENTE = /\b(client|cliente|clientes|customer|contact|clientcenter|client_?user|portal_?client)\b/i;
const EH_ESCRITORIO = /\b(staff|firm|escrit[oó]rio|employee|accountant|contador|professional|onvio_?staff|staffcenter)\b/i;
/** 'escritorio' | 'cliente' | null (sem sinal claro). */
export function perfilDaSessao(s) {
  if (!s || typeof s !== 'object') return null;
  let cli = false, esc = false;
  const ver = (o, prof) => {
    if (!o || typeof o !== 'object' || prof > 4) return;
    for (const [k, v] of Object.entries(o)) {
      const kn = k.replace(/[_\s-]/g, '');
      if (/^(OnvioStaffAccess|DefaultStaff)$/i.test(kn) && (v === true || (typeof v === 'string' && !/^(|false|no|none|deny|denied|0)$/i.test(v.trim())))) esc = true;
      if (typeof v === 'boolean' && v) {
        if (/^is(client|clientuser|contact|customer|cliente)$/i.test(kn)) cli = true;
        if (/^is(staff|staffuser|firm|firmuser|employee|escritorio)$/i.test(kn)) esc = true;
      } else if ((typeof v === 'string' || Array.isArray(v)) && CHAVE_TIPO.test(kn)) {
        const txt = [].concat(v).filter(x => typeof x === 'string').join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        if (EH_CLIENTE.test(txt)) cli = true;
        if (EH_ESCRITORIO.test(txt)) esc = true;
      } else if (v && typeof v === 'object') ver(v, prof + 1);
    }
  };
  ver(s, 0);
  return cli && !esc ? 'cliente' : esc && !cli ? 'escritorio' : null;
}

// ---------- Clientes ----------
async function paginar(fetcher, caminho, pausa) {
  const itens = [];
  for (let pagina = 1; pagina <= 40; pagina++) {
    const d = await fetcher(`${API}${caminho}?itemsPerPage=100&pageIndex=${pagina}&startIndex=${(pagina - 1) * 100}`);
    const lote = listaDe(d); itens.push(...lote);
    const total = Number(d && (d.totalItems || d.totalElements)) || 0;
    const paginas = Number(d && d.totalPages) || 0;
    if (lote.length < 100 || (total && itens.length >= total) || (paginas && pagina >= paginas)) break;
    if (pausa) await pausa(300);
  }
  return itens;
}
/**
 * Empresas: lista da folha (id, código, nome) + lista de CND (CNPJ, situação), juntadas pelo código.
 * O id usado nos documentos pode ser o da folha ou o da CND (o Control Onvio tenta os dois): guardamos os dois.
 */
export async function listarClientes(fetcher, { pausa } = {}) {
  const por = new Map(); let falhaCnd = '';
  for (const c of await paginar(fetcher, 'br-payroll-sr/v1/clients', pausa)) {
    if (c == null || c.id == null) continue;
    const codigo = c.code == null ? '' : String(c.code);
    por.set(codigo || `id:${c.id}`, { ids: [String(c.id)], codigo, nome: c.name || c.clientName || '', cnpj: '', inativo: false });
  }
  try {
    for (const c of await paginar(fetcher, 'cnd/v1/clients', pausa)) {
      if (!c) continue;
      const codigo = c.code == null ? '' : String(c.code);
      const e = por.get(codigo) || (codigo && por.set(codigo, { ids: [], codigo, nome: c.clientName || c.name || '', cnpj: '', inativo: false }).get(codigo));
      if (!e) continue;
      if (c.id != null && !e.ids.includes(String(c.id))) e.ids.push(String(c.id));
      e.cnpj = String(c.nationalIdentity || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      e.inativo = /inativ|inactive|desativ|baixad/i.test(String(c.clientStatus || ''));
    }
  } catch (e) { falhaCnd = e.message; }
  return { clientes: [...por.values()], falhaCnd };
}

// ---------- Documentos ----------
const URL_PROJETOS = id => `${API}storage/v1/projects?primaryAssociationId=${encodeURIComponent(id)}&primaryAssociationType=Client&getScheduleItems=true`;
const URL_FILHOS = (tipo, id, de) => `${API}storage/v2/${tipo}/${encodeURIComponent(id)}/children?from=${de}&pageSize=100&sort=name:asc&containersOnly=false&trashed=false&countDocuments=false&calculateLocks=true`;

export async function filhosDe(fetcher, tipo, id, pausa) {
  const out = [];
  for (let de = 1, n = 0; n < 20; n++) {
    const d = await fetcher(URL_FILHOS(tipo, id, de)), lote = listaDe(d);
    out.push(...lote);
    const pag = (d && d.data && !Array.isArray(d.data) ? d.data : d) || {};
    if (!lote.length || !(pag.hasMore === true || (pag.hasMore == null && lote.length >= 100))) break;
    de += lote.length;
    if (pausa) await pausa(200);
  }
  return out;
}

const AUTOR = /(creat|upload|added|owner|author)/i, LEITURA = /(read|view|vis)/i;
/** Quem enviou o arquivo: 'cliente' | 'escritorio' | 'indefinida'. Procura pistas nos campos de autoria (a confirmar no portal real). */
export function origemDoDocumento(d) {
  let cli = false, esc = false;
  const ver = (o, prof, autor) => {
    if (!o || typeof o !== 'object' || prof > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (LEITURA.test(k)) continue; // "lido pelo cliente" não é autoria
      const a = autor || AUTOR.test(k);
      if (typeof v === 'boolean') {
        if (a && v) { if (/client|cliente|customer/i.test(k)) cli = true; if (/staff|firm|escrit|employee/i.test(k)) esc = true; }
      } else if (typeof v === 'string') {
        if (a && /(type|role|kind|tipo|profile)/i.test(k)) { if (EH_CLIENTE.test(v)) cli = true; if (EH_ESCRITORIO.test(v)) esc = true; }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) ver(v, prof + 1, a);
    }
  };
  ver(d, 0, false);
  return cli && !esc ? 'cliente' : esc && !cli ? 'escritorio' : 'indefinida';
}
const dia = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };

/**
 * Lê as pastas e arquivos de UMA empresa. Os "projetos" do cliente são os departamentos (Pessoal, Fiscal...) e viram a pasta de
 * primeiro nível. Se houver um projeto só e o nome dele não for um departamento conhecido, a raiz é esse projeto (desenho antigo).
 */
export async function lerEmpresa(fetcher, cliente, { pausa, profMax = 5, itensMax = 3000, conhecidas = [] } = {}) {
  let projetos = [];
  for (const id of cliente.ids) {
    projetos = listaDe(await fetcher(URL_PROJETOS(id))).filter(p => p && p.id != null);
    if (projetos.length) break;
    if (pausa) await pausa(200);
  }
  const ok = new Set(conhecidas.map(semAcento));
  const raizUnica = projetos.length === 1 && !ok.has(semAcento(nomeDe(projetos[0])));
  const fila = projetos.map(p => ({ tipo: 'Projects', id: p.id, caminho: raizUnica ? [] : [nomeDe(p)], prof: 0 }));
  const docs = []; let truncado = false, itens = 0;
  while (fila.length) {
    const no = fila.shift();
    if (pausa) await pausa(200);
    for (const x of await filhosDe(fetcher, no.tipo, no.id, pausa)) {
      if (++itens > itensMax) { truncado = true; break; }
      if (ehPasta(x)) { if (no.prof < profMax && x.id != null) fila.push({ tipo: 'Folders', id: x.id, caminho: [...no.caminho, nomeDe(x)], prof: no.prof + 1 }); else truncado = true; }
      else docs.push({ empresa: cliente.nome, cnpj: cliente.cnpj, pasta: no.caminho.join('/'), arquivo: nomeDe(x), data: dia(x.createdDate || x.modifiedDate), origem: origemDoDocumento(x) });
    }
    if (itens > itensMax) break;
  }
  return { docs, projetos: projetos.length, raizUnica, truncado };
}

/** Coleta várias empresas, uma de cada vez. onProgresso({feito,total}); parar() => true interrompe. */
export async function coletar(fetcher, clientes, { limite = 0, pausa, onProgresso, parar, conhecidas } = {}) {
  const alvo = clientes.filter(c => !c.inativo && c.ids.length).slice(0, limite > 0 ? limite : undefined);
  const docs = [], q = { empresas: alvo.length, lidas: 0, falhas: 0, semProjeto: 0, truncadas: 0, semCnpj: 0, docs: 0, origemIndefinida: 0 };
  for (const c of alvo) {
    if (parar && parar()) { q.interrompida = true; break; }
    try {
      const r = await lerEmpresa(fetcher, c, { pausa, conhecidas });
      docs.push(...r.docs); q.lidas++;
      if (!r.projetos) q.semProjeto++;
      if (r.truncado) q.truncadas++;
    } catch (e) { if (e instanceof AuthError) throw e; q.falhas++; }
    if (!c.cnpj) q.semCnpj++;
    if (onProgresso) onProgresso({ feito: q.lidas + q.falhas, total: alvo.length });
    if (pausa) await pausa(300);
  }
  q.docs = docs.length; q.origemIndefinida = docs.filter(d => d.origem === 'indefinida').length;
  return { docs, qualidade: q };
}

// ---------- Diagnóstico (só nomes de campos, nunca valores) ----------
export function camposDe(o, max = 40) {
  const out = [];
  const ver = (x, cam, prof) => {
    if (!x || typeof x !== 'object' || prof > 2 || out.length >= max) return;
    for (const [k, v] of Object.entries(x)) {
      const c = cam ? `${cam}.${k}` : k;
      out.push(`${c}:${Array.isArray(v) ? 'lista' : v === null ? 'nulo' : typeof v}`);
      if (v && typeof v === 'object' && !Array.isArray(v)) ver(v, c, prof + 1);
    }
  };
  ver(o, '', 0);
  return out;
}
const contar = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});

export async function diagnosticar(fetcher, { pausa, conhecidas = [] } = {}) {
  const rep = { passos: [], avisos: [] };
  const passo = (nome, ok, detalhe = '') => rep.passos.push({ nome, ok, detalhe });
  let sessao = null;
  try { sessao = await fetcher(API + 'security/v1/session-and-bindings'); } catch (e) { passo('Sessão do Onvio', false, e.message); return rep; }
  rep.perfil = perfilDaSessao(sessao);
  passo('Sessão do Onvio', true, `perfil: ${rep.perfil || 'não confirmado'}`);
  if (rep.perfil === 'cliente') { passo('Visão do escritório', false, 'o Onvio está com acesso de cliente: nada foi lido'); return rep; }
  let lista;
  try { lista = await listarClientes(fetcher, { pausa }); } catch (e) { passo('Lista de empresas', false, e.message); return rep; }
  const cl = lista.clientes;
  rep.empresas = { total: cl.length, comCnpj: cl.filter(c => c.cnpj).length, inativas: cl.filter(c => c.inativo).length, comDoisIds: cl.filter(c => c.ids.length > 1).length };
  passo('Lista de empresas', cl.length > 0, `${cl.length} empresas, ${rep.empresas.comCnpj} com CNPJ${lista.falhaCnd ? ` (CND falhou: ${lista.falhaCnd})` : ''}`);
  if (rep.empresas.comCnpj < cl.length) rep.avisos.push('Há empresas sem CNPJ: elas não casam com a lista de treinados do Hub.');
  const amostra = cl.find(c => !c.inativo && c.ids.length);
  if (!amostra) { passo('Pastas e arquivos', false, 'nenhuma empresa ativa para testar'); return rep; }
  try {
    const r = await lerEmpresa(fetcher, amostra, { pausa, profMax: 2, itensMax: 300, conhecidas });
    const projetos = [];
    for (const id of amostra.ids) { const p = listaDe(await fetcher(URL_PROJETOS(id))); if (p.length) { projetos.push(...p); rep.idQueFunciona = id === amostra.ids[0] ? 'primeiro (folha)' : 'segundo (CND)'; break; } }
    rep.amostra = { projetos: r.projetos, nomesDeNivel1: [...new Set(r.docs.map(d => d.pasta.split('/')[0]).filter(Boolean))], raizUnica: r.raizUnica, docsLidos: r.docs.length, truncado: r.truncado,
      origens: contar(r.docs.map(d => d.origem)), camposProjeto: camposDe(projetos[0]) };
    const raiz = projetos[0] && (await filhosDe(fetcher, 'Projects', projetos[0].id, pausa));
    if (raiz) { rep.amostra.camposPasta = camposDe(raiz.find(ehPasta)); rep.amostra.camposDocumento = camposDe(raiz.find(x => !ehPasta(x))); }
    passo('Pastas e arquivos', r.projetos > 0, `${r.projetos} projeto(s), ${r.docs.length} arquivo(s) até 2 níveis`);
    if (rep.amostra.origens.indefinida === r.docs.length && r.docs.length) rep.avisos.push('Não foi possível saber quem enviou cada arquivo (nenhum campo de autoria reconhecido). Veja "camposDocumento" e mande o relatório para ajustar a regra.');
  } catch (e) { passo('Pastas e arquivos', false, e.message); }
  return rep;
}
export function textoDoRelatorio(rep) {
  const L = ['RELATÓRIO DE LEITURA DO ONVIO (sem nomes de empresas ou pessoas)', ''];
  for (const p of rep.passos) L.push(`${p.ok ? '[ok]' : '[FALHOU]'} ${p.nome}: ${p.detalhe}`);
  if (rep.empresas) L.push('', `Empresas: ${JSON.stringify(rep.empresas)}`);
  if (rep.idQueFunciona) L.push(`Id usado nos documentos: ${rep.idQueFunciona}`);
  if (rep.amostra) {
    const a = rep.amostra;
    L.push('', `Projetos da empresa de teste: ${a.projetos}${a.raizUnica ? ' (raiz única)' : ''}`, `Pastas de primeiro nível: ${a.nomesDeNivel1.join(' | ') || '(nenhuma)'}`,
      `Origem dos arquivos lidos: ${JSON.stringify(a.origens)}`, `Campos do projeto: ${(a.camposProjeto || []).join(', ')}`, `Campos da pasta: ${(a.camposPasta || []).join(', ')}`, `Campos do documento: ${(a.camposDocumento || []).join(', ')}`);
  }
  if (rep.avisos.length) L.push('', ...rep.avisos.map(a => `AVISO: ${a}`));
  return L.join('\n');
}
