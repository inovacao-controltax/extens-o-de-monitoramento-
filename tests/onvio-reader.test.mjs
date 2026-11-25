import test from 'node:test';
import assert from 'node:assert/strict';
import { listarEquipe, caminhosBooleanos, diagnosticarNotificacoes, textoRelatorioNotificacoes, precisaRapida, mesclarEmpresas, classificarAutores, fetcherComFallback, precisaColetar, resumirChamadas, rotulo, lerResposta, API, leituraPermitida, guardar, perfilDaSessao, listarClientes, filhosDe, origemDoDocumento, lerEmpresa, coletar, diagnosticar, textoDoRelatorio, camposDe, AuthError } from '../src/onvio-reader.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { analyze } from '../src/rules.js';

// ---- API simulada do Onvio ----
const pasta = (id, name) => ({ id, name, itemType: 'Folder' });
const arq = (id, name, o = {}) => ({ id, name, mimeType: 'application/pdf', originalItemSize: 10, createdDate: '2026-11-20T10:00:00Z', ...o });
function fakeApi({ clientes, cnd, projetos, filhos, sessao }) {
  const pedidos = [];
  const f = async url => {
    pedidos.push(url);
    const u = new URL(url), p = u.pathname.slice(5), q = u.searchParams;
    if (p === 'security/v1/session-and-bindings') return sessao ?? { UdsSessionBindings: { FeatureResourcePermissions: { FeatureResourcePermissionsMap: { Platform: { OnvioStaffAccess: 'Allow' } } } } };
    if (p === 'br-payroll-sr/v1/clients' || p === 'cnd/v1/clients') {
      const lista = p.startsWith('br-') ? clientes : cnd, i = (Number(q.get('pageIndex')) - 1) * 100;
      return { items: lista.slice(i, i + 100), totalItems: lista.length };
    }
    if (p === 'storage/v1/projects') return { items: projetos[q.get('primaryAssociationId')] || [] };
    const m = /^storage\/v2\/(Projects|Folders)\/([^/]+)\/children$/.exec(p);
    if (m) { const todos = filhos[m[2]] || [], de = Number(q.get('from')) - 1, lote = todos.slice(de, de + 100); return { data: { items: lote, hasMore: de + 100 < todos.length } }; }
    throw new Error('HTTP 404');
  };
  f.pedidos = pedidos;
  return f;
}
const cenario = () => ({
  clientes: [{ id: 'f1', code: 1, name: 'Alfa Ltda' }, { id: 'f2', code: 2, name: 'Beta ME' }, { id: 'f3', code: 3, name: 'Gama SA' }],
  cnd: [{ id: 'c1', code: 1, clientName: 'Alfa Ltda', nationalIdentity: '11.222.333/0001-81', clientStatus: 'Ativo' }, { id: 'c2', code: 2, clientName: 'Beta ME', nationalIdentity: '12.ABC.345/01DE-35', clientStatus: 'Ativo' }, { id: 'c3', code: 3, clientName: 'Gama SA', nationalIdentity: '', clientStatus: 'Inativo' }],
  projetos: { f1: [{ id: 'pP', name: 'Pessoal' }, { id: 'pF', name: 'Fiscal' }], c2: [{ id: 'pB', name: 'Beta ME' }] }, // Beta: só o id da CND acha; projeto único com nome da empresa
  filhos: {
    pP: [pasta('d1', '2026'), arq('a1', 'folha.pdf', { createdBy: { userType: 'ClientUser' } })],
    d1: [arq('a2', '2026-11 - FOLHA - x.pdf', { createdBy: { userType: 'Staff' } })],
    pF: [arq('a3', 'scan01.pdf', { isCreatedByClientUser: true, isReadByClientUser: true })],
    pB: [pasta('bf', 'Fiscal'), pasta('bx', 'NOVA PASTA')],
    bf: [arq('b1', '2026-11 - NFE - a.pdf')], bx: [arq('b2', 'x.pdf')],
  },
});

test('lista fechada: só GET nas rotas mapeadas do onvio.com.br', () => {
  assert.equal(leituraPermitida(API + 'storage/v2/Folders/abc/children?from=1'), true);
  assert.equal(leituraPermitida(API + 'storage/v1/projects?primaryAssociationId=1'), true);
  assert.equal(leituraPermitida(API + 'service-requesting/v1/tickets/generic'), false);
  assert.equal(leituraPermitida(API + 'storage/v1/folders/abc'), false);
  assert.equal(leituraPermitida('https://evil.com/api/storage/v1/projects'), false);
  assert.equal(leituraPermitida('https://onvio.com.br.evil.com/api/cnd/v1/clients'), false);
  assert.equal(leituraPermitida('nao é url'), false);
});
test('guardar recusa antes de chamar o fetcher', async () => {
  let chamou = false;
  const g = guardar(async () => { chamou = true; return {}; });
  await assert.rejects(() => g(API + 'service-requesting/v1/tickets/generic'), /não permitida/);
  assert.equal(chamou, false);
});
test('perfil: escritório, cliente e sem sinal', () => {
  assert.equal(perfilDaSessao({ A: { Platform: { OnvioStaffAccess: 'Allow' } } }), 'escritorio');
  assert.equal(perfilDaSessao({ user: { userType: 'ClientUser' } }), 'cliente');
  assert.equal(perfilDaSessao({ x: 1 }), null);
});
test('origem do arquivo: autoria, e "lido pelo cliente" não conta', () => {
  assert.equal(origemDoDocumento({ createdBy: { userType: 'ClientUser' } }), 'cliente');
  assert.equal(origemDoDocumento({ createdBy: { userType: 'Staff' } }), 'escritorio');
  assert.equal(origemDoDocumento({ isCreatedByClientUser: true }), 'cliente');
  assert.equal(origemDoDocumento({ isReadByClientUser: true, name: 'x' }), 'indefinida');
  assert.equal(origemDoDocumento({}), 'indefinida');
});
test('clientes: junta folha e CND pelo código, com paginação e dois ids', async () => {
  const c = cenario();
  c.clientes = Array.from({ length: 130 }, (_, i) => ({ id: 'f' + (i + 1), code: i + 1, name: 'E' + (i + 1) }));
  c.cnd = [{ id: 'c1', code: 1, clientName: 'E1', nationalIdentity: '11.222.333/0001-81', clientStatus: 'Ativo' }, { id: 'c9', code: 9, clientName: 'E9', nationalIdentity: '12.ABC.345/01DE-35', clientStatus: 'Baixada' }];
  const f = fakeApi(c);
  const { clientes } = await listarClientes(f);
  assert.equal(clientes.length, 130);
  assert.deepEqual(clientes[0], { ids: ['f1', 'c1'], codigo: '1', nome: 'E1', cnpj: '11222333000181', inativo: false, situacao: 'Ativo' });
  assert.equal(clientes[8].inativo, true);
  assert.equal(clientes[8].cnpj, '12ABC34501DE35');
  assert.equal(f.pedidos.filter(u => u.includes('br-payroll-sr')).length, 2);
});
test('clientes: se a CND falha, segue só com a folha e avisa', async () => {
  const f = fakeApi(cenario()); const base = f;
  const g = async u => { if (u.includes('cnd/v1')) throw new Error('HTTP 500'); return base(u); };
  const r = await listarClientes(g);
  assert.equal(r.clientes.length, 3); assert.equal(r.falhaCnd, 'HTTP 500'); assert.equal(r.clientes[0].cnpj, '');
});
test('filhosDe pagina com hasMore', async () => {
  const filhos = { p: Array.from({ length: 230 }, (_, i) => arq('x' + i, 'a' + i + '.pdf')) };
  const f = fakeApi({ clientes: [], cnd: [], projetos: {}, filhos });
  assert.equal((await filhosDe(f, 'Projects', 'p')).length, 230);
});
test('empresa: projetos viram a pasta de primeiro nível e desce nas subpastas', async () => {
  const f = fakeApi(cenario());
  const r = await lerEmpresa(f, { nome: 'Alfa', cnpj: '11222333000181', ids: ['f1', 'c1'] }, { conhecidas: ['Pessoal', 'Fiscal'] });
  assert.equal(r.projetos, 2); assert.equal(r.raizUnica, false);
  assert.deepEqual(r.docs.map(d => [d.pasta, d.arquivo, d.origem]).sort(), [['Fiscal', 'scan01.pdf', 'cliente'], ['Pessoal', 'folha.pdf', 'cliente'], ['Pessoal/2026', '2026-11 - FOLHA - x.pdf', 'escritorio']]);
  assert.equal(r.docs[0].data, '2026-11-20');
});
test('empresa: tenta o segundo id e usa raiz única quando o projeto não é departamento', async () => {
  const f = fakeApi(cenario());
  const r = await lerEmpresa(f, { nome: 'Beta', cnpj: 'x', ids: ['f2', 'c2'] }, { conhecidas: ['Pessoal', 'Fiscal'] });
  assert.equal(r.raizUnica, true);
  assert.deepEqual(r.docs.map(d => d.pasta).sort(), ['Fiscal', 'NOVA PASTA']);
});
test('empresa: limite de itens marca truncado', async () => {
  const filhos = { p: Array.from({ length: 50 }, (_, i) => arq('x' + i, 'a' + i + '.pdf')) };
  const f = fakeApi({ clientes: [], cnd: [], projetos: { 1: [{ id: 'p', name: 'Pessoal' }] }, filhos });
  const r = await lerEmpresa(f, { nome: 'A', cnpj: '', ids: ['1'] }, { itensMax: 10, conhecidas: ['Pessoal'] });
  assert.equal(r.truncado, true); assert.equal(r.docs.length, 10);
});
test('coleta: pula inativas, respeita limite, conta qualidade e chama progresso', async () => {
  const f = fakeApi(cenario()), prog = [];
  const { clientes } = await listarClientes(f);
  const r = await coletar(f, clientes, { conhecidas: ['Pessoal', 'Fiscal'], onProgresso: p => prog.push(p.feito) });
  assert.equal(r.qualidade.empresas, 2); assert.equal(r.qualidade.lidas, 2); assert.equal(r.qualidade.docs, 5);
  assert.deepEqual(prog, [1, 2]);
  const r1 = await coletar(f, clientes, { limite: 1, conhecidas: ['Pessoal', 'Fiscal'] });
  assert.equal(r1.qualidade.lidas, 1);
});
test('coleta: falha numa empresa não derruba as outras; erro de sessão derruba', async () => {
  const f = fakeApi(cenario()); const { clientes } = await listarClientes(f);
  const g = async u => { if (u.includes('primaryAssociationId=f1')) throw new Error('HTTP 500'); return f(u); };
  const r = await coletar(g, clientes, { conhecidas: ['Pessoal', 'Fiscal'] });
  assert.equal(r.qualidade.falhas, 1); assert.equal(r.qualidade.lidas, 1);
  const h = async () => { throw new AuthError('HTTP 401'); };
  await assert.rejects(() => coletar(h, clientes), AuthError);
});
test('coleta: parar() interrompe', async () => {
  const f = fakeApi(cenario()); const { clientes } = await listarClientes(f);
  const r = await coletar(f, clientes, { parar: () => true, conhecidas: [] });
  assert.equal(r.qualidade.interrompida, true); assert.equal(r.qualidade.lidas, 0);
});
test('coleta alimenta as regras: nome fora do padrão, pasta fora e origem', async () => {
  const f = fakeApi(cenario()); const { clientes } = await listarClientes(f);
  const { docs } = await coletar(f, clientes, { conhecidas: DEFAULT_CONFIG.allowedFolders });
  const cfg = { ...DEFAULT_CONFIG, trained: [] };
  const r = analyze({ docs, users: [] }, cfg, new Date('2026-11-25T12:00:00Z'));
  assert.deepEqual(r.nomenclatura.map(x => x.arquivo).sort(), ['folha.pdf', 'scan01.pdf']);
  assert.deepEqual(r.pastas.map(x => x.pasta), ['NOVA PASTA']);
});
test('diagnóstico: relatório só com nomes de campos, sem nomes de empresa', async () => {
  const f = fakeApi(cenario());
  const rep = await diagnosticar(f, { conhecidas: ['Pessoal', 'Fiscal'] });
  assert.equal(rep.perfil, 'escritorio'); assert.equal(rep.empresas.total, 3); assert.equal(rep.empresas.comCnpj, 2);
  assert.ok(rep.avisos.some(a => /sem CNPJ/.test(a)));
  assert.ok(rep.amostra.camposDocumento.includes('createdBy.userType:string'));
  const t = textoDoRelatorio(rep);
  assert.match(t, /Pastas de primeiro nível: Pessoal \| Fiscal/);
  assert.doesNotMatch(t, /Alfa|Beta|Gama/);
});
test('diagnóstico: acesso de cliente não lê nada; sem sessão falha visível', async () => {
  const f = fakeApi({ ...cenario(), sessao: { user: { userType: 'ClientUser' } } });
  const rep = await diagnosticar(f);
  assert.equal(rep.perfil, 'cliente'); assert.equal(rep.passos.at(-1).ok, false); assert.equal(f.pedidos.length, 1);
  const rep2 = await diagnosticar(async () => { throw new AuthError('redirecionou (HTTP 302)'); });
  assert.equal(rep2.passos[0].ok, false);
});
test('diagnóstico avisa quando nenhum campo de autoria é reconhecido', async () => {
  const c = cenario(); c.filhos = { pP: [arq('a1', 'x.pdf')], pF: [arq('a3', 'y.pdf')] };
  const rep = await diagnosticar(fakeApi(c), { conhecidas: ['Pessoal', 'Fiscal'] });
  assert.ok(rep.avisos.some(a => /quem enviou/.test(a)));
});
test('camposDe lista só nomes e tipos', () => {
  assert.deepEqual(camposDe({ a: 'segredo', b: { c: 1 }, d: [1] }), ['a:string', 'b:object', 'b.c:number', 'd:lista']);
});

// ---------- Fase 4e: o que o relatório do Onvio real mostrou ----------
const dd = (autor, cnpj, extra = {}) => ({ cnpj, empresa: cnpj, pasta: 'Fiscal', arquivo: 'a.pdf', origem: 'indefinida', autor, eu: false, ...extra });
test('autoria: quem envia para muitas empresas é do escritório; poucas, cliente; o id não fica guardado', () => {
  const docs = [...['1', '2', '3', '4'].map(c => dd('staff-A', c)), dd('cli-1', '1'), dd('cli-1', '1'), dd('cli-2', '2'), dd('', '3'), dd('x', '4', { arquivo: '' })];
  const r = classificarAutores(docs);
  assert.deepEqual(docs.map(d => d.origem), ['escritorio', 'escritorio', 'escritorio', 'escritorio', 'cliente', 'cliente', 'cliente', 'indefinida', 'indefinida']);
  assert.deepEqual(r, { distintos: 4, escritorio: 1, clientes: 3, minEmpresas: 3 });
  assert.ok(docs.every(d => !('autor' in d) && !('eu' in d)));
});
test('autoria: o usuário logado é sempre do escritório, mesmo em uma empresa só', () => {
  const docs = [dd('eu', '1', { eu: true }), dd('cli', '1')];
  classificarAutores(docs);
  assert.deepEqual(docs.map(d => d.origem), ['escritorio', 'cliente']);
});
test('autoria: com muitas empresas o limite sobe (um cliente de grupo com 4 empresas não vira escritório)', () => {
  const docs = [];
  for (let i = 0; i < 40; i++) docs.push(dd('staff', 'e' + i));
  for (let i = 0; i < 4; i++) docs.push(dd('grupo', 'e' + i));
  const r = classificarAutores(docs);
  assert.equal(r.minEmpresas, 6);
  assert.equal(docs.filter(d => d.origem === 'cliente').length, 4);
});
test('leitura de empresa: autor sai do createdBy.userGuid e projeto desconhecido só entra pelo nome', async () => {
  const c = cenario();
  c.projetos.f1 = [{ id: 'pP', name: 'Pessoal' }, { id: 'pX', name: 'Registro de Empresas' }];
  c.filhos.pP = [arq('a1', 'folha.pdf', { createdBy: { userGuid: 'g-1', isCurrentUser: true } })];
  c.filhos.pX = [arq('x1', 'contrato.pdf')];
  const f = fakeApi(c);
  const r = await lerEmpresa(f, { nome: 'Alfa', cnpj: '1', ids: ['f1'] }, { conhecidas: ['Pessoal', 'Fiscal'], soConhecidas: true });
  assert.deepEqual(r.docs.map(d => [d.pasta, d.arquivo, d.autor, d.eu]), [['Registro de Empresas', '', undefined, undefined], ['Pessoal', 'folha.pdf', 'g-1', true]]);
  assert.equal(f.pedidos.some(u => u.includes('/Projects/pX/')), false, 'não desce no projeto desconhecido');
  assert.equal(r._amostra.doc.name, 'folha.pdf');
});
test('empresas: a folha dá 403 (usuário fora do Pessoal) e a leitura segue pela CND', async () => {
  const c = cenario(); const base = fakeApi(c);
  const f = async u => { if (u.includes('br-payroll-sr')) throw new AuthError('HTTP 403'); return base(u); };
  const r = await listarClientes(f);
  assert.equal(r.clientes.length, 3);
  assert.equal(r.fontes.folha.ok, false); assert.equal(r.fontes.cnd.ok, true);
  assert.deepEqual(r.clientes[0].ids, ['c1']);
});
test('empresas: nenhuma lista responde = erro que diz o motivo de cada uma', async () => {
  const f = async () => { throw new Error('HTTP 500'); };
  await assert.rejects(() => listarClientes(f), /folha: HTTP 500 · cnd: HTTP 500 · nfe: HTTP 500/);
  await assert.rejects(() => listarClientes(async () => { throw new AuthError('HTTP 401'); }), AuthError);
});
test('empresas: sem folha nem CND, usa a lista de NF-e', async () => {
  const f = async u => { if (u.includes('manifesto')) return { items: [{ id: 'n1', code: 7, name: 'Zeta', nationalIdentity: '11.222.333/0001-81', active: false }], totalItems: 1 }; throw new Error('HTTP 404'); };
  const r = await listarClientes(f);
  assert.deepEqual(r.clientes, [{ ids: ['n1'], codigo: '7', nome: 'Zeta', cnpj: '11222333000181', inativo: true, situacao: '' }]);
});
test('jeito de ler: tenta o seguinte quando o primeiro falha, lembra o que funcionou e não insiste em 404', async () => {
  const ok = { status: 200, ct: 'application/json', body: '{"a":1}' };
  const chamadas = [];
  const f = fetcherComFallback([{ via: 'A', f: async u => (chamadas.push('A'), { status: 0, ct: '', body: 'x' }) }, { via: 'B', f: async u => (chamadas.push('B'), ok) }], { espera: async () => {} });
  assert.deepEqual(await f('u1'), { a: 1 }); assert.equal(f.via, 'B');
  await f('u2'); assert.deepEqual(chamadas, ['A', 'B', 'B']);
  const g = fetcherComFallback([{ via: 'A', f: async () => ({ status: 404, ct: 'text/plain', body: '' }) }, { via: 'B', f: async () => { throw new Error('não devia chamar'); } }]);
  await assert.rejects(() => g('u'), /HTTP 404/);
  const h = fetcherComFallback([{ via: 'A', f: async () => ({ status: 302, ct: '', body: '' }) }, { via: 'B', f: async () => ({ status: 401, ct: '', body: '' }) }]);
  await assert.rejects(() => h('u'), /Tentativas: A: redirecionou \(HTTP 302\) · B: HTTP 401/);
});
test('jeito de ler: 503 e 429 esperam e tentam de novo uma vez', async () => {
  let n = 0; const esperas = [];
  const f = fetcherComFallback([{ via: 'A', f: async () => (++n === 1 ? { status: 429, ct: '', body: '' } : { status: 200, ct: 'application/json', body: '[]' }) }], { espera: async ms => esperas.push(ms) });
  assert.deepEqual(await f('u'), []); assert.deepEqual(esperas, [3000]);
});
test('registro das chamadas: rota sem ids e resumo por rota', async () => {
  const log = [];
  const g = guardar(async u => { if (u.includes('Folders')) throw new Error('HTTP 500'); return {}; }, c => log.push(c));
  await g(API + 'storage/v2/Projects/segredo123/children?from=1');
  await g(API + 'storage/v2/Folders/outro456/children?from=1').catch(() => {});
  await g(API + 'storage/v1/projects?primaryAssociationId=emp-9');
  assert.deepEqual(log.map(c => c.rota), ['storage/v2/Projects/{id}/children', 'storage/v2/Folders/{id}/children', 'storage/v1/projects?primaryAssociationId={id}']);
  assert.ok(!JSON.stringify(log).includes('segredo123') && !JSON.stringify(log).includes('emp-9'));
  assert.deepEqual(resumirChamadas(log).find(c => c.falhas), { rota: 'storage/v2/Folders/{id}/children', n: 1, falhas: 1, erro: 'HTTP 500' });
  assert.equal(rotulo(API + 'cnd/v1/clients?itemsPerPage=1'), 'cnd/v1/clients');
});
test('diagnóstico segue mesmo se a rota de sessão falhar, e mostra situações das empresas e as chamadas', async () => {
  const f = fakeApi(cenario()); const log = [];
  const g = guardar(async u => { if (u.includes('session-and-bindings')) throw new Error('HTTP 404'); return f(u); }, c => log.push(c));
  const rep = await diagnosticar(g, { conhecidas: ['Pessoal', 'Fiscal'], chamadas: log, via: 'teste' });
  assert.equal(rep.passos[0].ok, false); assert.match(rep.passos[0].detalhe, /seguindo mesmo assim/);
  assert.equal(rep.empresas.total, 3);
  assert.deepEqual(rep.situacoes, { Ativo: 2, Inativo: 1 });
  const t = textoDoRelatorio(rep);
  assert.match(t, /Jeito de ler: teste/); assert.match(t, /Chamadas ao Onvio/); assert.match(t, /\[FALHOU\] security\/v1\/session-and-bindings/);
});
test('diagnóstico vê os campos de pasta e documento mesmo quando o 1º projeto está vazio', async () => {
  const c = cenario(); c.projetos.f1 = [{ id: 'vazio', name: 'Administrativo' }, { id: 'pP', name: 'Pessoal' }];
  c.filhos.vazio = []; c.filhos.pP = [pasta('d1', '2026'), arq('a1', 'x.pdf', { createdBy: { userGuid: 'g', isCurrentUser: false } })]; c.filhos.d1 = [];
  const rep = await diagnosticar(fakeApi(c), { conhecidas: ['Pessoal'] });
  assert.ok(rep.amostra.camposPasta.includes('itemType:string'));
  assert.ok(rep.amostra.camposDocumento.includes('createdBy.userGuid:string'));
  assert.deepEqual(rep.amostra.autores, { distintos: 1, doUsuarioLogado: 0, comAutor: 1 });
});
test('leitura automática: só quando os dados faltam ou estão velhos, e não insiste logo depois de falhar', () => {
  const agora = Date.UTC(2026, 10, 25, 12), h = n => agora - n * 36e5, cfg = { autoLer: true, horasAuto: 6 };
  assert.equal(precisaColetar({ snapshot: null, cfg, agora }), true);
  assert.equal(precisaColetar({ snapshot: { fonte: 'onvio', coletadoEm: h(1) }, cfg, agora }), false);
  assert.equal(precisaColetar({ snapshot: { fonte: 'onvio', coletadoEm: h(7) }, cfg, agora }), true);
  assert.equal(precisaColetar({ snapshot: { fonte: 'onvio', coletadoEm: h(7) }, cfg: { ...cfg, autoLer: false }, agora }), false);
  assert.equal(precisaColetar({ snapshot: null, cfg, agora, estado: { estado: 'sem_sessao', fimEm: agora - 10 * 60 * 1000 } }), false);
  assert.equal(precisaColetar({ snapshot: null, cfg, agora, estado: { estado: 'erro', fimEm: agora - 40 * 60 * 1000 } }), true);
  assert.equal(lerResposta({ status: 200, ct: 'application/json', body: '{}' }) !== null, true);
});

// ---------- Fase 4f: leitura ao vivo ----------
const muitas = n => {
  const c = cenario();
  c.clientes = Array.from({ length: n }, (_, i) => ({ id: 'f' + i, code: i + 1, name: 'E' + i }));
  c.cnd = c.clientes.map((x, i) => ({ id: 'c' + i, code: i + 1, clientName: 'E' + i, nationalIdentity: String(i).padStart(14, '0'), clientStatus: 'Ativo' }));
  c.projetos = {}; c.filhos = {};
  c.clientes.forEach((x, i) => { c.projetos['f' + i] = [{ id: 'p' + i, name: 'Pessoal' }]; c.filhos['p' + i] = [arq('a' + i, 'doc' + i + '.pdf', { createdBy: { userGuid: 'cli' + i } })]; });
  return c;
};
test('páginas da lista vêm em paralelo, na ordem, e sem perder nem repetir item (250 empresas)', async () => {
  const f = fakeApi(muitas(250));
  const { clientes } = await listarClientes(f);
  assert.equal(clientes.length, 250);
  assert.deepEqual(clientes.map(c => c.codigo).slice(0, 3), ['1', '2', '3']);
  assert.equal(new Set(clientes.map(c => c.codigo)).size, 250);
  assert.equal(f.pedidos.filter(u => u.includes('br-payroll-sr')).length, 3);
});
test('lista: o progresso é informado (lidos e total)', async () => {
  const marcas = [];
  await listarClientes(fakeApi(muitas(250)), { onLista: l => marcas.push(`${l.fonte}:${l.lidos}/${l.total}`) });
  assert.ok(marcas.some(m => m.startsWith('folha:') && m.endsWith('/250')));
  assert.equal(marcas.filter(m => m.startsWith('folha:')).at(-1), 'folha:250/250');
});
test('coleta em paralelo lê todas as empresas uma vez só e conta igual à sequencial', async () => {
  const c = muitas(20), f = fakeApi(c), { clientes } = await listarClientes(f);
  const seq = await coletar(f, clientes, { conhecidas: ['Pessoal'], paralelo: 1 });
  const par = await coletar(f, clientes, { conhecidas: ['Pessoal'], paralelo: 4 });
  assert.equal(par.qualidade.lidas, 20); assert.equal(par.docs.length, seq.docs.length);
  assert.deepEqual(par.docs.map(d => d.arquivo).sort(), seq.docs.map(d => d.arquivo).sort());
});
test('em paralelo, erro de sessão ainda interrompe tudo e falha numa empresa não derruba as outras', async () => {
  const c = muitas(10), f = fakeApi(c), { clientes } = await listarClientes(f);
  const g = async u => { if (u.includes('primaryAssociationId=f3')) throw new Error('HTTP 500'); return f(u); };
  const r = await coletar(g, clientes, { conhecidas: ['Pessoal'], paralelo: 4 });
  assert.equal(r.qualidade.falhas, 1); assert.equal(r.qualidade.lidas, 9);
  const h = async u => { if (u.includes('primaryAssociationId=f5')) throw new AuthError('HTTP 401'); return f(u); };
  await assert.rejects(() => coletar(h, clientes, { conhecidas: ['Pessoal'], paralelo: 4 }), AuthError);
});
test('prioridade: as empresas treinadas são lidas primeiro', async () => {
  const c = muitas(10), f = fakeApi(c), { clientes } = await listarClientes(f);
  const ordem = [];
  const g = async u => { const m = /primaryAssociationId=(f\d+)/.exec(u); if (m) ordem.push(m[1]); return f(u); };
  await coletar(g, clientes, { conhecidas: ['Pessoal'], prioridade: new Set([clientes[7].cnpj, clientes[9].cnpj]) });
  assert.deepEqual(ordem.slice(0, 3), ['f7', 'f9', 'f0']);
});
test('dados parciais ao vivo: já classificados, em cópia, e o resultado final não é afetado', async () => {
  const c = muitas(12), f = fakeApi(c), { clientes } = await listarClientes(f);
  const parciais = [];
  const r = await coletar(f, clientes, { conhecidas: ['Pessoal'], paralelo: 2, cadaParcialMs: 0, onParcial: async p => parciais.push(p) });
  assert.ok(parciais.length >= 5, 'emitiu várias vezes: ' + parciais.length);
  assert.ok(parciais.at(-1).qualidade.lidas >= parciais[0].qualidade.lidas);
  assert.ok(parciais.every(p => p.docs.every(d => !('autor' in d))), 'sem identificador de autor');
  assert.ok(parciais[0].docs.every(d => d.origem !== 'indefinida' || !d.arquivo));
  assert.equal(r.qualidade.lidas, 12); assert.equal(r.docs.length, 12);
});
test('releitura rápida: só com dados recentes, treinadas cadastradas e 10 min desde a última', () => {
  const agora = Date.UTC(2026, 10, 25, 12), min = n => agora - n * 60 * 1000, cfg = { autoLer: true, trained: [{ cnpj: '1' }] };
  const snap = (extra = {}) => ({ fonte: 'onvio', coletadoEm: min(30), ...extra });
  assert.equal(precisaRapida({ snapshot: snap(), cfg, agora }), true);
  assert.equal(precisaRapida({ snapshot: snap({ rapidaEm: min(5) }), cfg, agora }), false);
  assert.equal(precisaRapida({ snapshot: snap(), cfg: { ...cfg, trained: [] }, agora }), false);
  assert.equal(precisaRapida({ snapshot: snap({ parcial: true }), cfg, agora }), false);
  assert.equal(precisaRapida({ snapshot: null, cfg, agora }), false);
  assert.equal(precisaColetar({ snapshot: snap({ parcial: true, coletadoEm: min(1) }), cfg: { autoLer: true }, agora }), true, 'leitura interrompida continua');
});
test('mesclar: troca só as linhas das empresas relidas', () => {
  const antigos = [{ cnpj: 'A', arquivo: 'velho.pdf' }, { cnpj: 'B', arquivo: 'b.pdf' }, { cnpj: 'A', arquivo: '' }];
  assert.deepEqual(mesclarEmpresas(antigos, [{ cnpj: 'A', arquivo: 'novo.pdf' }], ['A']), [{ cnpj: 'B', arquivo: 'b.pdf' }, { cnpj: 'A', arquivo: 'novo.pdf' }]);
});

// ---------- Fase 5b: notificações dos funcionários do escritório ----------
const h32 = n => n.toString(16).padStart(32, '0');
function fakeNotif({ n = 30, comConfig = 12, usaId = false } = {}) {
  const equipe = Array.from({ length: n }, (_, i) => ({ id: h32(i + 1), contactId: h32(1000 + i), name: 'Pessoa ' + i }));
  const f = async url => {
    const u = new URL(url), p = u.pathname.slice(5);
    if (p === 'br-payroll-sr/v1/employees') return { items: equipe, totalItems: n, totalPages: 1, pageIndex: 0 };
    const m = /^service-requesting\/v1\/contact-notifications\/([0-9a-f]{32})$/.exec(p);
    if (m) {
      const i = usaId ? parseInt(m[1], 16) - 1 : parseInt(m[1], 16) - 1000;
      if (i < 0 || i >= comConfig) throw new Error('HTTP 404');
      return { newServiceRequest: { email: i % 2 === 0, system: false }, tramite: { email: true, system: false, scope: 'OnlyUser' }, responsavel: { email: true } };
    }
    throw new Error('HTTP 404');
  };
  return f;
}
test('lista fechada: contact-notifications do service-requesting e a equipe; BOX-e e outras rotas continuam fora', () => {
  assert.equal(leituraPermitida(API + `service-requesting/v1/contact-notifications/${h32(5)}`), true);
  assert.equal(leituraPermitida(API + 'br-payroll-sr/v1/employees?itemsPerPage=500&pageIndex=0'), true);
  assert.equal(leituraPermitida(API + `boxe/v1/contact-notifications/${h32(5)}`), false);
  assert.equal(leituraPermitida(API + `service-requesting/v1/contact-notifications/${h32(5)}/x`), false);
  assert.equal(leituraPermitida(API + 'br-payroll-sr/v1/employees/123/salary'), false);
  assert.equal(rotulo(API + `service-requesting/v1/contact-notifications/${h32(77)}`), 'service-requesting/v1/contact-notifications/{id}');
});
test('equipe: uma página grande, sem repetir', async () => {
  const eq = await listarEquipe(fakeNotif({ n: 107 }));
  assert.equal(eq.length, 107); assert.equal(new Set(eq.map(x => x.id)).size, 107);
  assert.deepEqual(Object.keys(eq[0]), ['id', 'contactId', 'nome']);
});
test('booleanos: só caminhos', () => assert.deepEqual(caminhosBooleanos({ a: { b: true, c: 'x' }, d: false, e: [true] }), [['a.b', true], ['d', false]]));
test('sondagem das notificações: códigos, nomes de campos e contagens, sem nome nem id de pessoa', async () => {
  const log = [];
  const g = guardar(fakeNotif({ n: 30, comConfig: 12 }), c => log.push(c));
  const rep = await diagnosticarNotificacoes(g, { amostra: 30, chamadas: log, via: 'teste' });
  assert.deepEqual(rep.amostra.status, { 200: 12, 404: 18 }); assert.equal(rep.amostra.comConfiguracao, 12);
  assert.equal(rep.identificador, 'contactId'); assert.equal(rep.equipe.total, 30);
  assert.ok(rep.campos.includes('newServiceRequest.email:boolean'));
  assert.equal(rep.booleanos['newServiceRequest.email'], 'sim 6 · não 6'); assert.equal(rep.booleanos['newServiceRequest.system'], 'sim 0 · não 12');
  assert.ok(rep.avisos.some(a => /404/.test(a)));
  const t = textoRelatorioNotificacoes(rep);
  assert.ok(!/Pessoa \d|OnlyUser/.test(t) && !/[0-9a-f]{32}/.test(t), 'sem nomes, valores nem identificadores');
  assert.match(t, /newServiceRequest\.email: sim 6 · não 6/); assert.match(t, /contact-notifications\/\{id\}/);
});
test('sondagem: descobre que a rota usa o id do funcionário (não o contactId); tudo 404 avisa', async () => {
  const rep = await diagnosticarNotificacoes(fakeNotif({ n: 10, comConfig: 10, usaId: true }), { amostra: 10 });
  assert.equal(rep.identificador, 'id'); assert.equal(rep.amostra.comConfiguracao, 10);
  const rep2 = await diagnosticarNotificacoes(fakeNotif({ n: 10, comConfig: 0 }), { amostra: 10 });
  assert.equal(rep2.amostra.comConfiguracao, 0); assert.ok(rep2.avisos.some(a => /404 para todos/.test(a)));
  const rep3 = await diagnosticarNotificacoes(async () => { throw new Error('HTTP 500'); });
  assert.equal(rep3.passos[0].ok, false);
});

// ---- Monitor de notificações (equipe toda) ----
import { lerNotificacoesEscritorio, detectarCamposNovaSolicitacao } from '../src/onvio-reader.js';
import { checkNotificacoesOnvio } from '../src/rules.js';
test('detecta os campos de "nova solicitação" por e-mail e por sistema', () => {
  const c = [['newServiceRequest.email'], ['newServiceRequest.system'], ['tramite.email'], ['tramite.system']];
  assert.deepEqual(detectarCamposNovaSolicitacao(c), { email: 'newServiceRequest.email', sistema: 'newServiceRequest.system' });
  assert.deepEqual(detectarCamposNovaSolicitacao(c, { email: 'tramite.email' }).email, 'tramite.email');
  assert.deepEqual(detectarCamposNovaSolicitacao([['a.b']]), { email: '', sistema: '' });
});
test('lê a equipe toda: 200 = configurado, 404 = padrão; sem e-mail nem id na saída', async () => {
  const r = await lerNotificacoesEscritorio(fakeNotif({ n: 40, comConfig: 12 }), { paralelo: 4 });
  assert.equal(r.total, 40); assert.equal(r.itens.length, 40);
  assert.equal(r.itens.filter(i => i.estado === 'configurado').length, 12);
  assert.equal(r.itens.filter(i => i.estado === 'padrao').length, 28);
  assert.deepEqual(r.campos, { email: 'newServiceRequest.email', sistema: 'newServiceRequest.system' });
  assert.deepEqual(Object.keys(r.itens[0]).sort(), ['email', 'estado', 'nome', 'sistema']);
  assert.equal(r.itens[0].email, true); assert.equal(r.itens[1].email, false); assert.equal(r.itens[1].sistema, false);
});
test('regra: só e-mail E sistema desligados; sem configuração só com a chave', async () => {
  const r = await lerNotificacoesEscritorio(fakeNotif({ n: 10, comConfig: 4 }));
  // i ímpar: email false e system false (fake) => desligado
  assert.equal(checkNotificacoesOnvio(r, {}).length, 2);
  assert.equal(checkNotificacoesOnvio(r, { notifPadraoDesligado: true }).length, 2 + 6);
  assert.equal(checkNotificacoesOnvio(r, { notifPadraoDesligado: true }).filter(x => x.situacao === 'padrao').length, 6);
  assert.deepEqual(checkNotificacoesOnvio(null, {}), []);
});
test('analyze usa notif do Onvio quando existe', () => {
  const a = analyze({ docs: [], trained: [], notif: { itens: [{ nome: 'A', estado: 'configurado', email: false, sistema: false }, { nome: 'B', estado: 'configurado', email: true, sistema: false }] } }, DEFAULT_CONFIG);
  assert.equal(a.notificacoes.length, 1); assert.equal(a.notificacoes[0].nome, 'A');
});
test('erro de sessão na leitura da equipe interrompe tudo', async () => {
  const f = async url => { if (/employees/.test(url)) return { items: [{ id: h32(1), contactId: h32(2), name: 'X' }], totalItems: 1, totalPages: 1 }; throw new AuthError('sessão'); };
  await assert.rejects(lerNotificacoesEscritorio(f), AuthError);
});

test('formato real do Onvio: newTicketEmail/newTicketSystem são a nova solicitação; newTopic* (trâmite) não', () => {
  const c = ['completedTopicEmail', 'newTicketEmail', 'newTicketSystem', 'newTopicEmail', 'newTopicSystem', 'newTopicEmailAllContacts', 'forwardedTopicEmail'].map(x => [x]);
  assert.deepEqual(detectarCamposNovaSolicitacao(c), { email: 'newTicketEmail', sistema: 'newTicketSystem' });
});
