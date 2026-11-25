// Leitor do Onvio (Fase 4c). SÓ LEITURA: GET numa lista fechada de rotas, dentro da sessão do usuário do escritório.
// Rotas e formatos seguem o mapeamento do Control Onvio (portal-do-cliente.md, hub-envio-completo). Tudo que o Onvio
// pode ter mudado falha de forma visível (diagnóstico), nunca vira número errado em silêncio.
// O "fetcher" é injetado: no navegador vem da aba do Onvio (src/onvio-tab.js); nos testes é uma API simulada.

export const API = 'https://onvio.com.br/api/';
const PERMITIDAS = [
  /^security\/v1\/session-and-bindings$/i,
  /^br-payroll-sr\/v1\/clients$/i,
  /^cnd\/v1\/clients$/i,
  /^manifesto\/v1\/clients$/i,
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
/** Nome da rota sem ids e sem valores (para o relatório): storage/v2/Folders/{id}/children. */
export const rotulo = url => { try { return new URL(url).pathname.slice(5).replace(/\/[^/]+(?=\/children$)/, '/{id}') + (new URL(url).searchParams.has('primaryAssociationId') ? '?primaryAssociationId={id}' : ''); } catch (e) { return String(url).slice(0, 60); } };
export const guardar = (fetcher, onChamada) => async url => {
  if (!leituraPermitida(url)) throw new Error('leitura não permitida: ' + String(url).slice(0, 80));
  const t0 = Date.now();
  try { const r = await fetcher(url); if (onChamada) onChamada({ rota: rotulo(url), ok: true, ms: Date.now() - t0 }); return r; }
  catch (e) { if (onChamada) onChamada({ rota: rotulo(url), ok: false, erro: String(e && e.message || e).slice(0, 90), ms: Date.now() - t0 }); throw e; }
};
/** Junta as chamadas por rota: quantas, quantas falharam e o último erro. */
export function resumirChamadas(log) {
  const por = new Map();
  for (const c of log) { const g = por.get(c.rota) || { rota: c.rota, n: 0, falhas: 0, erro: '' }; g.n++; if (!c.ok) { g.falhas++; g.erro = c.erro; } por.set(c.rota, g); }
  return [...por.values()];
}

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
/** Roda as tarefas com no máximo `n` ao mesmo tempo, devolvendo os resultados na ordem. */
async function emParalelo(tarefas, n) {
  const out = new Array(tarefas.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => { while (i < tarefas.length) { const k = i++; out[k] = await tarefas[k](); } }));
  return out;
}
const urlPagina = (caminho, p) => `${API}${caminho}?itemsPerPage=100&pageIndex=${p}&startIndex=${(p - 1) * 100}`;
/** Lê a lista inteira: a 1ª página diz o total e as demais vêm 4 de cada vez. Sem total, segue página a página. */
async function paginar(fetcher, caminho, pausa, onPagina) {
  const d1 = await fetcher(urlPagina(caminho, 1));
  const itens = [...listaDe(d1)];
  const total = Number(d1 && (d1.totalItems || d1.totalElements)) || 0;
  const paginas = Number(d1 && d1.totalPages) || (total ? Math.ceil(total / 100) : 0);
  if (onPagina) onPagina(itens.length, total);
  if (itens.length < 100 || (total && itens.length >= total)) return itens;
  if (paginas > 1) {
    const resto = await emParalelo(Array.from({ length: Math.min(paginas, 40) - 1 }, (_, k) => async () => { const d = await fetcher(urlPagina(caminho, k + 2)); const l = listaDe(d); if (onPagina) onPagina(null, total, l.length); return l; }), 4);
    resto.forEach(l => itens.push(...l));
    return itens;
  }
  for (let pagina = 2; pagina <= 40; pagina++) {           // o Onvio não informou o total: página a página
    const d = await fetcher(urlPagina(caminho, pagina)); const lote = listaDe(d); itens.push(...lote);
    if (onPagina) onPagina(itens.length, total);
    if (lote.length < 100) break;
    if (pausa) await pausa(150);
  }
  return itens;
}
/**
 * Empresas, juntando pelo código as listas que o usuário conseguir ler: folha (id, código, nome), CND (CNPJ, situação) e,
 * se as duas não derem nada, a de NF-e. Cada fonte é independente: quem não é do Pessoal leva 403 na folha e a leitura segue pela CND.
 * O id usado nos documentos pode ser o da folha ou o da CND (o Control Onvio tenta os dois): guardamos todos.
 * Só falha de vez se NENHUMA fonte responder; aí devolve o motivo de cada uma.
 */
export async function listarClientes(fetcher, { pausa, onLista } = {}) {
  const por = new Map(), fontes = {};
  const nova = (codigo, id, nome) => ({ ids: id == null ? [] : [String(id)], codigo, nome: nome || '', cnpj: '', inativo: false, situacao: '' });
  const juntar = (c, nome, cnpj, inativo) => {
    if (!c) return;
    const codigo = c.code == null ? '' : String(c.code);
    const chave = codigo || `id:${c.id}`;
    const e = por.get(chave) || por.set(chave, nova(codigo, null, nome(c))).get(chave);
    if (c.id != null && !e.ids.includes(String(c.id))) e.ids.push(String(c.id));
    if (!e.nome) e.nome = nome(c);
    const doc = cnpj(c); if (doc) e.cnpj = doc;
    if (inativo(c)) e.inativo = true;
    if (c.clientStatus != null) e.situacao = String(c.clientStatus).slice(0, 30);
  };
  const doc = v => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const rodar = async (nome, caminho, tratar) => {
    let lidos = 0;
    try { const itens = await paginar(fetcher, caminho, pausa, (n, total, mais) => { lidos = n != null ? Math.max(lidos, n) : lidos + (mais || 0); if (onLista) onLista({ fonte: nome, lidos, total }); }); itens.forEach(tratar); fontes[nome] = { ok: true, n: itens.length }; }
    catch (e) { fontes[nome] = { ok: false, erro: String(e && e.message || e), auth: e instanceof AuthError }; }
  };
  await rodar('folha', 'br-payroll-sr/v1/clients', c => c && c.id != null && juntar(c, x => x.name || x.clientName, () => '', () => false));
  await rodar('cnd', 'cnd/v1/clients', c => c && juntar(c, x => x.clientName || x.name, x => doc(x.nationalIdentity), x => /inativ|inactive|desativ|baixad/i.test(String(x.clientStatus || ''))));
  if (!por.size) await rodar('nfe', 'manifesto/v1/clients', c => c && juntar(c, x => x.name || x.clientName, x => doc(x.nationalIdentity), x => x.active === false || /inativ|inactive|desativ|baixad/i.test(String(x.clientStatus || ''))));
  if (!por.size) {
    const motivo = Object.entries(fontes).map(([k, v]) => `${k}: ${v.ok ? 'vazia' : v.erro}`).join(' · ');
    throw (Object.values(fontes).some(v => v.auth) ? new AuthError(motivo) : new Error(motivo));
  }
  return { clientes: [...por.values()], falhaCnd: fontes.cnd && !fontes.cnd.ok ? fontes.cnd.erro : '', fontes };
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
/** Identificador de quem criou o item (o Onvio só informa `createdBy.userGuid`, sem dizer se é cliente ou escritório). */
const autorDe = x => { const c = x && (x.createdBy || x.uploadedBy || x.addedBy); return c && typeof c === 'object' && c.userGuid ? String(c.userGuid) : ''; };
/**
 * Define a origem de cada arquivo pelo autor: quem envia para MUITAS empresas (ou é o usuário logado) é do escritório; quem aparece em
 * poucas é cliente. Heurística, até o vínculo com a lista de funcionários ser mapeado. Sem autor, mantém o que já tinha ('indefinida').
 * minEmpresas: em quantas empresas diferentes o autor tem de aparecer para ser do escritório (3 se a leitura for pequena).
 */
export function classificarAutores(docs, { minEmpresas } = {}) {
  const empresasDe = new Map(), eu = new Set();
  const nEmp = new Set(docs.map(d => d.cnpj || d.empresa)).size;
  const min = minEmpresas || (nEmp >= 30 ? 6 : 3);
  for (const d of docs) {
    if (!d.autor) continue;
    if (d.eu) eu.add(d.autor);
    (empresasDe.get(d.autor) || empresasDe.set(d.autor, new Set()).get(d.autor)).add(d.cnpj || d.empresa);
  }
  const esc = new Set([...empresasDe].filter(([g, e]) => e.size >= min).map(([g]) => g));
  eu.forEach(g => esc.add(g));
  let cliente = 0;
  for (const d of docs) {
    if (!d.arquivo) { delete d.autor; delete d.eu; continue; }
    if (d.autor) { d.origem = esc.has(d.autor) ? 'escritorio' : 'cliente'; if (d.origem === 'cliente') cliente++; }
    delete d.autor; delete d.eu;                                       // o identificador não fica guardado
  }
  return { distintos: empresasDe.size, escritorio: esc.size, clientes: empresasDe.size - esc.size, minEmpresas: min };
}
const dia = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; };

/**
 * Lê as pastas e arquivos de UMA empresa. Os "projetos" do cliente são os departamentos (Pessoal, Fiscal...) e viram a pasta de
 * primeiro nível. Se houver um projeto só e o nome dele não for um departamento conhecido, a raiz é esse projeto (desenho antigo).
 */
export async function lerEmpresa(fetcher, cliente, { pausa, profMax = 5, itensMax = 3000, conhecidas = [], soConhecidas = false, descer } = {}) {
  let projetos = [];
  for (const id of cliente.ids) {
    projetos = listaDe(await fetcher(URL_PROJETOS(id))).filter(p => p && p.id != null);
    if (projetos.length) break;
    if (pausa) await pausa(200);
  }
  const ok = new Set(conhecidas.map(semAcento));
  const raizUnica = projetos.length === 1 && !ok.has(semAcento(nomeDe(projetos[0])));
  // Para ler mais rápido, só desce nos projetos conhecidos (departamentos que importam); os outros entram só pelo nome.
  const lerSo = new Set((descer || conhecidas).map(semAcento));
  const desce = p => !soConhecidas || raizUnica || lerSo.has(semAcento(nomeDe(p)));
  const fila = projetos.filter(desce).map(p => ({ tipo: 'Projects', id: p.id, caminho: raizUnica ? [] : [nomeDe(p)], prof: 0 }));
  const docs = projetos.filter(p => !desce(p)).map(p => ({ empresa: cliente.nome, cnpj: cliente.cnpj, pasta: nomeDe(p), arquivo: '', data: '', origem: 'sistema' }));
  const _amostra = { pasta: null, doc: null }; let truncado = false, itens = 0;
  while (fila.length) {
    const no = fila.shift();
    if (pausa) await pausa(120);
    for (const x of await filhosDe(fetcher, no.tipo, no.id, pausa)) {
      if (++itens > itensMax) { truncado = true; break; }
      if (ehPasta(x)) { _amostra.pasta = _amostra.pasta || x; if (no.prof < profMax && x.id != null) fila.push({ tipo: 'Folders', id: x.id, caminho: [...no.caminho, nomeDe(x)], prof: no.prof + 1 }); else truncado = true; }
      else { _amostra.doc = _amostra.doc || x; docs.push({ empresa: cliente.nome, cnpj: cliente.cnpj, pasta: no.caminho.join('/'), arquivo: nomeDe(x), data: dia(x.createdDate || x.modifiedDate), origem: origemDoDocumento(x), autor: autorDe(x), eu: !!(x.createdBy && x.createdBy.isCurrentUser) }); }
    }
    if (itens > itensMax) break;
  }
  return { docs, projetos: projetos.length, raizUnica, truncado, _amostra };
}

/**
 * Coleta várias empresas, `paralelo` de cada vez (padrão 1). `prioridade` (Set de CNPJ) lê essas primeiro.
 * onProgresso({feito,total}); onParcial({docs, qualidade}) a cada `cadaParcialMs` com o que já foi lido (docs já classificados, cópia);
 * parar() => true interrompe. Erro de sessão (AuthError) interrompe tudo; falha numa empresa não derruba as outras.
 */
export async function coletar(fetcher, clientes, { limite = 0, pausa, onProgresso, parar, conhecidas, descer, paralelo = 1, prioridade, onParcial, cadaParcialMs = 2500 } = {}) {
  let alvo = clientes.filter(c => !c.inativo && c.ids.length);
  if (prioridade && prioridade.size) alvo = [...alvo.filter(c => prioridade.has(c.cnpj)), ...alvo.filter(c => !prioridade.has(c.cnpj))];
  alvo = alvo.slice(0, limite > 0 ? limite : undefined);
  const docs = [], q = { empresas: alvo.length, lidas: 0, falhas: 0, semProjeto: 0, truncadas: 0, semCnpj: 0, docs: 0, origemIndefinida: 0 };
  let i = 0, fatal = null, ultimo = 0;                       // o 1º parcial sai logo depois da 1ª empresa
  const resumo = (lista) => { const x = { ...q }; x.docs = lista.filter(d => d.arquivo).length; x.origemIndefinida = lista.filter(d => d.arquivo && d.origem === 'indefinida').length; return x; };
  async function trabalhador() {
    while (!fatal) {
      if (parar && parar()) { q.interrompida = true; return; }
      const c = alvo[i++]; if (!c) return;
      try {
        const r = await lerEmpresa(fetcher, c, { pausa, conhecidas, soConhecidas: true, descer });
        docs.push(...r.docs); q.lidas++;
        if (!r.projetos) q.semProjeto++;
        if (r.truncado) q.truncadas++;
      } catch (e) { if (e instanceof AuthError) { fatal = e; return; } q.falhas++; }
      if (!c.cnpj) q.semCnpj++;
      if (onProgresso) onProgresso({ feito: q.lidas + q.falhas, total: alvo.length });
      // cadência adaptativa: quanto mais linhas já lidas, mais caro é entregar um parcial
      if (onParcial && Date.now() - ultimo >= (cadaParcialMs === 0 ? 0 : Math.max(cadaParcialMs, Math.min(15000, docs.length * 0.15)))) {
        ultimo = Date.now();
        const copia = docs.map(d => ({ ...d })); const aut = classificarAutores(copia);
        await onParcial({ docs: copia, qualidade: { ...resumo(copia), autores: aut } });
      }
      if (pausa) await pausa(paralelo > 1 ? 60 : 150);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, trabalhador));
  if (fatal) throw fatal;
  const aut = classificarAutores(docs);
  const fim = resumo(docs); Object.assign(q, { docs: fim.docs, origemIndefinida: fim.origemIndefinida, autores: aut });
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

export async function diagnosticar(fetcher, { pausa, conhecidas = [], chamadas = [], via = '' } = {}) {
  const rep = { passos: [], avisos: [], via };
  const passo = (nome, ok, detalhe = '') => rep.passos.push({ nome, ok, detalhe });
  // 1) Sessão: informativa. Se esta rota falhar, o resto ainda é tentado (só para se for claramente acesso de cliente).
  try {
    const sessao = await fetcher(API + 'security/v1/session-and-bindings');
    rep.perfil = perfilDaSessao(sessao);
    passo('Sessão do Onvio', true, `perfil: ${rep.perfil || 'não confirmado'}`);
    if (rep.perfil === 'cliente') { passo('Visão do escritório', false, 'o Onvio está com acesso de cliente: nada foi lido'); return finalizar(rep, chamadas); }
  } catch (e) { passo('Sessão do Onvio', false, `${e.message} (seguindo mesmo assim)`); }
  // 2) Empresas
  let lista;
  try { lista = await listarClientes(fetcher, { pausa }); } catch (e) { passo('Lista de empresas', false, e.message); return finalizar(rep, chamadas); }
  const cl = lista.clientes;
  rep.fontes = Object.fromEntries(Object.entries(lista.fontes).map(([k, v]) => [k, v.ok ? `ok (${v.n})` : `falhou: ${v.erro}`]));
  rep.situacoes = contar(cl.map(c => c.situacao || '(vazio)'));
  rep.empresas = { total: cl.length, comCnpj: cl.filter(c => c.cnpj).length, inativas: cl.filter(c => c.inativo).length, comDoisIds: cl.filter(c => c.ids.length > 1).length };
  passo('Lista de empresas', cl.length > 0, `${cl.length} empresas, ${rep.empresas.comCnpj} com CNPJ`);
  if (rep.empresas.comCnpj < cl.length) rep.avisos.push('Há empresas sem CNPJ: elas não casam com a lista de treinados do Hub.');
  if (Object.values(lista.fontes).some(v => !v.ok)) rep.avisos.push('Alguma lista de empresas não respondeu (veja "Fontes"). A leitura segue com as que responderam.');
  // 3) Pastas e arquivos de uma empresa de teste
  const amostra = cl.find(c => !c.inativo && c.ids.length);
  if (!amostra) { passo('Pastas e arquivos', false, 'nenhuma empresa ativa para testar'); return finalizar(rep, chamadas); }
  try {
    const r = await lerEmpresa(fetcher, amostra, { pausa, profMax: 2, itensMax: 300, conhecidas });
    const projetos = [];
    for (const id of amostra.ids) { const p = listaDe(await fetcher(URL_PROJETOS(id))); if (p.length) { projetos.push(...p); rep.idQueFunciona = id === amostra.ids[0] ? 'primeiro (folha)' : 'segundo (CND)'; break; } }
    rep.amostra = { projetos: r.projetos, nomesDeNivel1: [...new Set(r.docs.map(d => d.pasta.split('/')[0]).filter(Boolean))], raizUnica: r.raizUnica, docsLidos: r.docs.length, truncado: r.truncado,
      origens: contar(r.docs.map(d => d.origem)), camposProjeto: camposDe(projetos[0]) };
    rep.amostra.camposPasta = camposDe(r._amostra.pasta); rep.amostra.camposDocumento = camposDe(r._amostra.doc);
    const autores = new Set(r.docs.map(d => d.autor).filter(Boolean));
    rep.amostra.autores = { distintos: autores.size, doUsuarioLogado: r.docs.filter(d => d.eu).length, comAutor: r.docs.filter(d => d.autor).length };
    passo('Pastas e arquivos', r.projetos > 0, `${r.projetos} projeto(s), ${r.docs.length} arquivo(s) até 2 níveis`);
    if (!rep.amostra.camposDocumento.length) rep.avisos.push('A empresa de teste não tem nenhum arquivo nos 2 primeiros níveis: os campos do documento não puderam ser vistos.');
    if (!r.projetos) rep.avisos.push('A empresa de teste não tem projeto no portal de documentos pelos ids tentados. Pode ser outro id (veja "Campos da empresa").');
    if (rep.amostra.origens.indefinida === r.docs.length && r.docs.length) rep.avisos.push('Não foi possível saber quem enviou cada arquivo (nenhum campo de autoria reconhecido). Veja "camposDocumento" e mande o relatório para ajustar a regra.');
  } catch (e) { passo('Pastas e arquivos', false, e.message); }
  return finalizar(rep, chamadas);
}
function finalizar(rep, chamadas) { rep.chamadas = resumirChamadas(chamadas); return rep; }
export function textoDoRelatorio(rep) {
  const L = ['RELATÓRIO DE LEITURA DO ONVIO (sem nomes de empresas ou pessoas)', ''];
  for (const p of rep.passos) L.push(`${p.ok ? '[ok]' : '[FALHOU]'} ${p.nome}: ${p.detalhe}`);
  if (rep.via) L.push('', `Jeito de ler: ${rep.via}`);
  if (rep.fontes) L.push(`Fontes das empresas: ${Object.entries(rep.fontes).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (rep.empresas) L.push('', `Empresas: ${JSON.stringify(rep.empresas)}`);
  if (rep.situacoes) L.push(`Situação das empresas: ${JSON.stringify(rep.situacoes)}`);
  if (rep.idQueFunciona) L.push(`Id usado nos documentos: ${rep.idQueFunciona}`);
  if (rep.amostra) {
    const a = rep.amostra;
    L.push('', `Projetos da empresa de teste: ${a.projetos}${a.raizUnica ? ' (raiz única)' : ''}`, `Pastas de primeiro nível: ${a.nomesDeNivel1.join(' | ') || '(nenhuma)'}`,
      `Origem dos arquivos lidos: ${JSON.stringify(a.origens)}`, `Autores na amostra: ${JSON.stringify(a.autores)}`, `Campos do projeto: ${(a.camposProjeto || []).join(', ')}`, `Campos da pasta: ${(a.camposPasta || []).join(', ')}`, `Campos do documento: ${(a.camposDocumento || []).join(', ')}`);
  }
  if (rep.avisos.length) L.push('', ...rep.avisos.map(a => `AVISO: ${a}`));
  if (rep.chamadas && rep.chamadas.length) L.push('', 'Chamadas ao Onvio (rota, quantas, falhas):', ...rep.chamadas.map(c => `  ${c.falhas ? '[FALHOU]' : '[ok]    '} ${c.rota}  x${c.n}${c.falhas ? `  falhas: ${c.falhas}  ${c.erro}` : ''}`));
  return L.join('\n');
}

// ---------- Resposta HTTP -> dados (ou erro que diz o que aconteceu) ----------
export function lerResposta(v) {
  const tipo = String(v.ct || '').split(';')[0] || 'sem tipo';
  if (v.status === 401 || v.status === 403) throw new AuthError('HTTP ' + v.status);
  if (v.status >= 300 && v.status < 400) throw new AuthError('redirecionou (HTTP ' + v.status + ')');
  if (v.status < 200 || v.status >= 300) throw new Error('HTTP ' + v.status);
  if (!/json/i.test(v.ct || '')) throw new AuthError('o Onvio devolveu uma página (' + tipo + ') em vez de dados');
  try { return JSON.parse(v.body); } catch (e) { throw new Error('resposta inválida do Onvio'); }
}
const dorme = ms => new Promise(r => setTimeout(r, ms));
/**
 * Lê com o jeito que funcionar: tenta os "brutos" na ordem (lembrando o que deu certo). Espera e tenta de novo em 503/429.
 * brutos: [{ via, f: async url => ({status, ct, body}) }]. Devolve fetcher; fetcher.via diz o jeito usado por último.
 */
export function fetcherComFallback(brutos, { espera = dorme } = {}) {
  let preferido = 0;
  const f = async url => {
    const falhas = [];
    for (let k = 0; k < brutos.length; k++) {
      const i = (preferido + k) % brutos.length, b = brutos[i];
      let v = await b.f(url);
      if (v.status === 503) { await espera(800); v = await b.f(url); }
      if (v.status === 429) { await espera(3000); v = await b.f(url); }
      try { const dados = lerResposta(v); preferido = i; f.via = b.via; return dados; }
      catch (e) {
        if (v.status === 0) falhas.push(`${b.via}: falha de rede`);
        else if (v.status >= 200 && v.status < 300 && /json/i.test(v.ct || '')) throw e;   // resposta boa, mas inválida: outro jeito não ajuda
        else if (v.status === 404 || v.status === 400 || v.status === 412) throw e;           // a rota recusou o pedido: outro jeito não ajuda
        else falhas.push(`${b.via}: ${e.message}`);
      }
    }
    throw new AuthError('Tentativas: ' + falhas.join(' · '));
  };
  return f;
}

// ---------- Leitura automática ----------
/** Precisa ler agora? Dados do Onvio ausentes ou velhos, leitura ligada e sem tentativa recente. */
export function precisaColetar({ snapshot, cfg, agora = Date.now(), estado }) {
  if (cfg.autoLer === false) return false;
  const horas = Number(cfg.horasAuto) > 0 ? Number(cfg.horasAuto) : 6;
  const velho = !snapshot || snapshot.fonte !== 'onvio' || snapshot.parcial || agora - snapshot.coletadoEm > horas * 36e5;
  if (!velho) return false;
  if (estado && estado.fimEm && estado.estado !== 'ok' && agora - estado.fimEm < 30 * 60 * 1000) return false;   // falhou há pouco: espera 30 min
  return true;
}

/** Releitura rápida (as empresas prioritárias) quando os dados são recentes mas têm mais de `minutos`. */
export function precisaRapida({ snapshot, cfg, agora = Date.now(), minutos = 10 }) {
  if (cfg.autoLer === false || !snapshot || snapshot.fonte !== 'onvio' || snapshot.parcial) return false;
  if (!(cfg.trained && cfg.trained.length)) return false;
  return agora - Math.max(snapshot.coletadoEm || 0, snapshot.rapidaEm || 0) >= minutos * 60 * 1000;
}
/** Troca no snapshot as linhas das empresas relidas (por CNPJ), mantendo as demais. */
export function mesclarEmpresas(docsAntigos, docsNovos, cnpjsLidos) {
  const lidos = new Set(cnpjsLidos);
  return [...docsAntigos.filter(d => !lidos.has(d.cnpj)), ...docsNovos];
}
