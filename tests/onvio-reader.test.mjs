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
  assert.equal(leituraPermitida(API + 'security/v1/users'), false);
  assert.equal(leituraPermitida(API + 'storage/v1/folders/abc'), false);
  assert.equal(leituraPermitida('https://evil.com/api/storage/v1/projects'), false);
  assert.equal(leituraPermitida('https://onvio.com.br.evil.com/api/cnd/v1/clients'), false);
  assert.equal(leituraPermitida('nao é url'), false);
});
test('guardar recusa antes de chamar o fetcher', async () => {
  let chamou = false;
  const g = guardar(async () => { chamou = true; return {}; });
  await assert.rejects(() => g(API + 'security/v1/users'), /não permitida/);
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
  assert.deepEqual(r, { distintos: 4, escritorio: 1, clientes: 3, minEmpresas: 3, metodo: 'heuristica', naEquipe: 0 });
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
  // sessão caiu de verdade (a conferência da sessão também recusa): para tudo
  const h = async u => { if (u.includes('primaryAssociationId=f5') || u.includes('session-and-bindings')) throw new AuthError('HTTP 401'); return f(u); };
  await assert.rejects(() => coletar(h, clientes, { conhecidas: ['Pessoal'], paralelo: 4 }), AuthError);
  // recusa só numa empresa, com a sessão viva: segue com as outras (antes parava a leitura inteira)
  const k = async u => { if (u.includes('primaryAssociationId=f5')) throw new AuthError('HTTP 401'); if (u.includes('session-and-bindings')) return {}; return f(u); };
  const r2 = await coletar(k, clientes, { conhecidas: ['Pessoal'], paralelo: 4 });
  assert.equal(r2.qualidade.lidas, 9); assert.equal(r2.qualidade.falhas, 1);
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
  assert.deepEqual(Object.keys(r.itens[0]).sort(), ['cfg', 'email', 'estado', 'nome', 'sistema']);      // cfg = só as opções (sim/não), para comparar com o padrão
  assert.ok(Object.values(r.itens[0].cfg).every(v => typeof v === 'boolean' || typeof v === 'number' || /^[A-Za-z_]{1,30}$/.test(v)));
  assert.equal(r.itens[0].email, true); assert.equal(r.itens[1].email, false); assert.equal(r.itens[1].sistema, false);
});
test('regra: fora do padrão = configuração diferente da do usuário modelo; sem configuração salva = padrão', () => {
  const padrao = { newTicketEmail: false, newTicketSystem: false, newTopicEmail: true, newTopicEmailAllContacts: false, newTopicSystem: false, completedTopicEmail: false };
  const notif = { modelo: { nome: 'Patricia Barcelos', estado: 'configurado', campos: padrao }, itens: [
    { nome: 'Patricia Barcelos', estado: 'configurado', cfg: { ...padrao } },
    { nome: 'Igual', estado: 'configurado', cfg: { ...padrao } },
    { nome: 'Ligou nova', estado: 'configurado', cfg: { ...padrao, newTicketEmail: true, newTicketSystem: true } },
    { nome: 'Todos os usuarios', estado: 'configurado', cfg: { ...padrao, newTopicEmailAllContacts: true } },
    { nome: 'Nunca salvou', estado: 'padrao' }, { nome: 'Erro', estado: 'erro' } ] };
  const r = checkNotificacoesOnvio(notif, {});
  assert.deepEqual(r.map(x => x.nome), ['Ligou nova', 'Todos os usuarios']);
  assert.match(r[0].motivo, /Nova Solicitação · e-mail/); assert.match(r[1].motivo, /Trâmite realizado/);
  // sem o modelo salvo no Onvio, não há com o que comparar: ninguém entra
  assert.deepEqual(checkNotificacoesOnvio({ ...notif, modelo: { nome: 'Patricia Barcelos', estado: 'padrao', campos: null } }, {}), []);
  assert.deepEqual(checkNotificacoesOnvio(null, {}), []);
});
test('analyze usa notif do Onvio quando existe', () => {
  const p = { newTicketEmail: false }, a = analyze({ docs: [], trained: [], notif: { modelo: { nome: 'M', estado: 'configurado', campos: p }, itens: [{ nome: 'A', estado: 'configurado', cfg: { newTicketEmail: true } }, { nome: 'B', estado: 'configurado', cfg: { newTicketEmail: false } }] } }, DEFAULT_CONFIG);
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

test('lista fechada: Solicitações de Serviço só as 10 listas e os trâmites; detalhe, anexos e outras rotas continuam fora', () => {
  const id = 'a'.repeat(32);
  for (const r of ['service-requesting/v1/tickets/generic?itemsPerPage=200', 'br-payroll-sr/v1/payroll-entries', 'br-payroll-sr/v1/employee-leave', 'br-payroll-sr/v1/interns-registrations',
    `service-requesting/v1/tickets/${id}/topics?expand=all`, `br-payroll-sr/v1/tickets/${id}/topics`, `br-payroll-sr/v1/employees-registrations/${id}/topics`, `br-payroll-sr/v1/payroll-entries/${id}/topics`])
    assert.equal(leituraPermitida(API + r), true, r);
  for (const r of [`service-requesting/v1/tickets/generic/${id}`, `service-requesting/v1/tickets/${id}/topics/${id}/attachments/${id}`, `service-requesting/v1/tickets/${id}`,
    'br-payroll-sr/v1/payroll-entries/salary', 'br-payroll-sr/v1/anything', `br-payroll-sr/v2/payroll-entries/${id}`])
    assert.equal(leituraPermitida(API + r), false, r);
});

// ---- Leitura rápida (0.13.0) ----
import { limitado } from '../src/onvio-reader.js';
const esp = ms => new Promise(r => setTimeout(r, ms));
test('limitado: nunca passa do limite de chamadas ao mesmo tempo', async () => {
  let ativas = 0, pico = 0;
  const f = limitado(async () => { ativas++; pico = Math.max(pico, ativas); await esp(5); ativas--; return 1; }, { max: 4 });
  await Promise.all(Array.from({ length: 40 }, (_, i) => f('u' + i)));
  assert.ok(pico <= 4 && pico >= 3, 'pico ' + pico);
});
test('limitado: 429 reduz o limite pela metade (mínimo 2) e respostas boas fazem subir de novo', async () => {
  let falhar = true;
  const f = limitado(async () => { if (falhar) throw new Error('HTTP 429'); return 1; }, { max: 8, min: 2 });
  for (let i = 0; i < 4; i++) await f('x').catch(() => {});
  assert.equal(f.alvo(), 2);                         // 8 -> 4 -> 2 -> 2
  falhar = false;
  for (let i = 0; i < 80; i++) await f('x');
  assert.ok(f.alvo() > 2 && f.alvo() <= 8, 'alvo ' + f.alvo());
});
test('limitado: erro que não é de calma não muda o limite e o erro volta para quem pediu', async () => {
  const f = limitado(async () => { throw new Error('HTTP 404'); }, { max: 6 });
  await assert.rejects(f('x'), /HTTP 404/);
  assert.equal(f.alvo(), 6);
});
test('modo rápido dá exatamente o mesmo resultado do modo normal (só chega antes)', async () => {
  const api = () => async url => {
    const u = new URL(url), p = u.pathname.slice(5); let m;
    if (/^storage\/v1\/projects$/.test(p)) return { items: ['Pessoal', 'Fiscal', 'Outros'].map((n, i) => ({ id: 'P' + i, name: n })) };
    if ((m = /^storage\/v2\/Projects\/([^/]+)\/children$/.exec(p))) return { items: [2025, 2026].map(a => ({ id: `${m[1]}-${a}`, name: String(a), itemType: 'Folder' })) };
    if ((m = /^storage\/v2\/Folders\/([^/]+)\/children$/.exec(p))) return m[1].split('-').length < 3 ? { items: [1, 2, 3].map(k => ({ id: `${m[1]}-${k}`, name: '0' + k, itemType: 'Folder' })) } : { items: [1, 2].map(i => ({ id: m[1] + 'd' + i, name: `a${i}.pdf`, itemType: 'Document', createdDate: '2026-11-01T10:00:00Z', createdBy: { userGuid: 'g' + i } })) };
    return { items: [] };
  };
  const cl = Array.from({ length: 12 }, (_, i) => ({ ids: [String(i + 1)], codigo: String(i + 1), nome: 'E' + i, cnpj: String(i + 1).padStart(14, '0'), inativo: false }));
  const o = { conhecidas: ['Pessoal', 'Fiscal'], descer: ['Pessoal', 'Fiscal'], pausa: () => esp(0) };
  const a = await coletar(guardar(api()), cl, { ...o, paralelo: 1 });
  const b = await coletar(limitado(guardar(api()), { max: 10 }), cl, { ...o, paralelo: 8, rapido: true });
  const k = r => r.docs.map(d => `${d.cnpj}|${d.pasta}|${d.arquivo}|${d.data}|${d.origem}`).sort();
  assert.deepEqual(k(b), k(a));
  assert.equal(b.qualidade.lidas, 12); assert.equal(b.qualidade.falhas, 0);
});

// ---- Confiabilidade e velocidade (0.14.0) ----
import { tamanhoDaPagina } from '../src/onvio-reader.js';
import { previsao } from '../src/auto-coleta.js';
test('página grande: se o Onvio recusar (400) volta a 100 e lembra; o resultado não muda', async () => {
  const tamanhos = [];
  const f = async url => {
    const n = Number(new URL(url).searchParams.get('pageSize')); tamanhos.push(n);
    if (n > 100) throw new Error('HTTP 400');
    return { items: [{ id: 'a', name: 'x.pdf', itemType: 'Document' }] };
  };
  assert.equal(tamanhoDaPagina(), 500);
  const r = await filhosDe(f, 'Projects', 'p1');
  assert.equal(r.length, 1);
  assert.deepEqual(tamanhos, [500, 100]);
  assert.equal(tamanhoDaPagina(), 100);
  await filhosDe(f, 'Projects', 'p2');
  assert.deepEqual(tamanhos.slice(2), [100]);            // já lembrou: não tenta 500 de novo
});
test('empresa que falhou é lida de novo no fim: só falha de verdade quem falhar duas vezes', async () => {
  const falhou = new Set();
  const api = async url => {
    const u = new URL(url), p = u.pathname.slice(5);
    if (/^storage\/v1\/projects$/.test(p)) {
      const c = u.searchParams.get('primaryAssociationId');
      if (c === '2' && !falhou.has(c)) { falhou.add(c); throw new Error('HTTP 503'); }       // cai na 1ª vez e se recupera
      if (c === '3') throw new Error('HTTP 500');                                              // nunca volta
      return { items: [{ id: 'P' + c, name: 'Fiscal' }] };
    }
    if (/\/children$/.test(p)) return { items: [{ id: 'd', name: 'a.pdf', itemType: 'Document', createdDate: '2026-11-01T10:00:00Z', createdBy: { userGuid: 'g' } }] };
    return { items: [] };
  };
  const cl = [1, 2, 3].map(i => ({ ids: [String(i)], codigo: String(i), nome: 'E' + i, cnpj: String(i).padStart(14, '0'), inativo: false }));
  const r = await coletar(guardar(api), cl, { conhecidas: ['Fiscal'], descer: ['Fiscal'], pausa: () => esp(0), paralelo: 2, rapido: true });
  assert.equal(r.qualidade.lidas, 2); assert.equal(r.qualidade.falhas, 1); assert.equal(r.qualidade.recuperadas, 1);
  assert.deepEqual(r.docs.map(d => d.cnpj).sort(), ['00000000000001', '00000000000002']);
});
test('previsão de término só depois de algumas empresas e nunca no fim', () => {
  const t0 = 1_000_000;
  assert.equal(previsao(t0, 5, 1000, t0 + 60000), '');
  assert.equal(previsao(t0, 100, 1000, t0 + 5 * 60000), ' · faltam ~45 min');
  assert.equal(previsao(t0, 1000, 1000, t0 + 60000), '');
  assert.equal(previsao(t0, 999, 1000, t0 + 60000), ' · faltam ~1 min');
});

// ---- Limite que se ajusta sozinho (0.14.1) ----
test('limitado: com resposta rápida e estável, o limite sobe até o máximo', async () => {
  const f = limitado(async () => { await esp(2); return 1; }, { max: 12, min: 2, inicio: 4 });
  await Promise.all(Array.from({ length: 600 }, () => f('x')));
  assert.ok(f.estatisticas().limitePico > 4, 'pico ' + f.estatisticas().limitePico);
  assert.ok(f.alvo() <= 12);
});
test('limitado: se a resposta piora quando há mais chamadas ao mesmo tempo, o limite recua e o pico não passa do ponto bom', async () => {
  let ativas = 0;
  // o "Onvio" simulado fica mais lento a cada chamada simultânea acima de 6
  const f = limitado(async () => { ativas++; const extra = Math.max(0, ativas - 6) * 12; await esp(3 + extra); ativas--; return 1; }, { max: 24, min: 2, inicio: 4 });
  await Promise.all(Array.from({ length: 500 }, () => f('x')));
  const e = f.estatisticas();
  assert.ok(e.reducoesPorLentidao > 0, 'sem redução por lentidão');
  assert.ok(e.limitePico <= 12 && f.alvo() <= 10, `pico ${e.limitePico} final ${f.alvo()}`);       // o ponto bom é ~6; nunca vai até o máximo (24)
});
test('limitado: estatísticas contam chamadas e recusas', async () => {
  let falha = 0;
  const f = limitado(async () => { if (falha++ < 2) throw new Error('HTTP 503'); return 1; }, { max: 8 });
  await Promise.all([f('a').catch(() => {}), f('b').catch(() => {}), f('c'), f('d')]);
  const e = f.estatisticas();
  assert.equal(e.recuos, 2); assert.equal(e.chamadas, 2);
});

// ---- Autoria confiável (0.17.0) ----
import { idsDaEquipe, normGuid } from '../src/onvio-reader.js';
const GA = 'a1b2c3d4-0000-4000-8000-000000000001', GB = 'a1b2c3d4-0000-4000-8000-000000000002', GC = 'a1b2c3d4-0000-4000-8000-000000000003';
test('autoria exata: quem está na lista de funcionários é escritório e os demais são clientes, mesmo enviando para muitas filiais', () => {
  const filiais = Array.from({ length: 8 }, (_, i) => `25.096.492/${String(i + 1).padStart(4, '0')}-9${i}`);
  const docs = [...filiais.map(c => dd(GC, c)), dd(GA, '11.222.333/0001-81'), dd(GB, filiais[0])];   // GC: cliente de um grupo com 8 filiais; GA: funcionário (só 1 empresa)
  const r = classificarAutores(docs, { equipeIds: new Set([normGuid(GA)]) });
  assert.deepEqual(docs.map(d => d.origem), [...filiais.map(() => 'cliente'), 'escritorio', 'cliente']);
  assert.equal(r.metodo, 'equipe'); assert.equal(r.naEquipe, 1);
});
test('autoria por heurística: matriz e filiais contam como UMA empresa (o cliente de um grupo não vira escritório)', () => {
  const filiais = Array.from({ length: 8 }, (_, i) => `25.096.492/${String(i + 1).padStart(4, '0')}-9${i}`);
  const docs = [...filiais.map(c => dd(GC, c)), ...['11.222.333/0001-81', '45.723.174/0001-10', '11.444.777/0001-61'].map(c => dd(GA, c))];
  const r = classificarAutores(docs, {});
  assert.deepEqual(docs.slice(0, 8).map(d => d.origem), Array(8).fill('cliente'));       // 8 filiais = 1 grupo
  assert.deepEqual(docs.slice(8).map(d => d.origem), ['escritorio', 'escritorio', 'escritorio']);   // 3 grupos diferentes
  assert.equal(r.metodo, 'heuristica');
});
test('autoria: sem nenhum autor na lista de funcionários, a lista não vale (cai na heurística)', () => {
  const docs = ['1', '2', '3', '4'].map(c => dd(GA, c));
  const r = classificarAutores(docs, { equipeIds: new Set([normGuid(GB)]) });
  assert.equal(r.metodo, 'heuristica'); assert.equal(docs[0].origem, 'escritorio');
});
test('ids da equipe: pega todo identificador (GUID) do funcionário, com ou sem traços, sem guardar nada', async () => {
  const f = async url => ({ items: [{ id: GA, contactId: 'ffffffff-0000-4000-8000-00000000000a', name: 'Fulana', email: 'x@y.com', extra: { userGuid: GB.replace(/-/g, '').toUpperCase() } }], totalItems: 1, totalPages: 1 });
  const ids = await idsDaEquipe(f);
  assert.deepEqual([...ids].sort(), [normGuid(GA), normGuid(GB), 'ffffffff000040008000' + '00000000000a'].sort());
  assert.ok(![...ids].some(x => /@|fulana/i.test(x)));
});

test('conferir autoria: compara a lista de funcionários com a dedução, por empresa e no total', async () => {
  const { diagnosticarAutoria, textoRelatorioAutoria } = await import('../src/onvio-reader.js');
  const GRUPO = Array.from({ length: 8 }, (_, i) => `25.096.492/${String(i + 1).padStart(4, '0')}-9${i}`);
  const api = async url => {
    const u = new URL(url), p = u.pathname.slice(5);
    if (/^storage\/v1\/projects$/.test(p)) { const c = u.searchParams.get('primaryAssociationId'); return { items: [{ id: 'P' + c, name: 'Fiscal' }] }; }
    if ((p.match(/^storage\/v2\/Projects\/P(\d+)\/children$/))) { const c = Number(/P(\d+)/.exec(p)[1]); const autor = c <= 8 ? GC : GA; return { items: [{ id: 'd' + c, name: 'a.pdf', itemType: 'Document', createdDate: '2026-11-01T10:00:00Z', createdBy: { userGuid: autor } }, { id: 'e' + c, name: 'b.pdf', itemType: 'Document', createdDate: '2026-11-02T10:00:00Z', createdBy: { userGuid: GA } }] }; }
    return { items: [] };
  };
  const cl = [...GRUPO, '11.222.333/0001-81', '45.723.174/0001-10', '11.444.777/0001-61'].map((cnpj, i) => ({ ids: [String(i + 1)], codigo: String(i + 1), nome: 'E' + (i + 1), cnpj, inativo: false }));
  const r = await diagnosticarAutoria(guardar(api), cl, { amostra: 11, equipeIds: new Set([normGuid(GA)]), conhecidas: ['Fiscal'], descer: ['Fiscal'] });
  assert.equal(r.vinculo, true); assert.equal(r.autoresNaEquipe, 1); assert.equal(r.empresasLidas, 11);
  assert.equal(r.porEquipe.escritorio, 14); assert.equal(r.porEquipe.cliente, 8);                    // GA em todas (escritório); GC só nas 8 filiais do grupo (cliente)
  assert.equal(r.porHeuristica.cliente + r.porHeuristica.escritorio, 22);
  assert.equal(r.porEmpresa.length, 11);
  const t = textoRelatorioAutoria(r);
  assert.match(t, /BATE com a lista de funcionários/); assert.doesNotMatch(t, /a1b2c3d4/);          // nenhum identificador no relatório
  const sem = await diagnosticarAutoria(guardar(api), cl, { amostra: 3, equipeIds: new Set(), conhecidas: ['Fiscal'], descer: ['Fiscal'] });
  assert.equal(sem.vinculo, false); assert.match(textoRelatorioAutoria(sem), /ATENÇÃO/);
});

import { pastasDoModelo } from '../src/onvio-reader.js';
import { checkPastas } from '../src/rules.js';
test('pastas do padrão: lidas da empresa modelo (9999) e usadas no lugar da lista das configurações', async () => {
  const clientes = [{ codigo: '1', nome: 'Alfa', ids: ['a'] }, { codigo: '9999', nome: 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', ids: ['x', 'y'] }];
  const vistas = [];
  const f = async url => { vistas.push(url); return url.includes('=x&') ? [] : [{ id: 1, name: 'Pessoal' }, { id: 2, name: 'Fiscal' }, { id: 3, name: 'Pessoal' }]; };
  const r = await pastasDoModelo(f, clientes);
  assert.deepEqual(r, { ok: true, empresa: 'EMPRESA EXEMPLO SIMPLES NACIONAL LTDA', codigo: '9999', nomes: ['Pessoal', 'Fiscal'] });
  assert.equal((await pastasDoModelo(f, [{ codigo: '1', nome: 'A', ids: ['a'] }])).motivo, 'nao-achou');
  const docs = [{ empresa: 'A', cnpj: '1', pasta: 'Pessoal/2026', arquivo: 'a.pdf' }, { empresa: 'A', cnpj: '1', pasta: 'Contábil/2026', arquivo: 'b.pdf' }, { empresa: 'B', cnpj: '2', pasta: 'Cobrança', arquivo: 'c.pdf' }];
  const cfg = { allowedFolders: ['Pessoal', 'Contábil'] };
  assert.deepEqual(checkPastas(docs, cfg).map(x => x.pasta), ['Cobrança']);                                    // sem modelo: a lista das configurações
  assert.deepEqual(checkPastas(docs, cfg, r.nomes).map(x => x.pasta).sort(), ['Contábil', 'Cobrança'].sort());  // com modelo: só as pastas dele
});

import { pastaSemNada, ESTAT } from '../src/onvio-reader.js';
test('velocidade: sem a página extra quando o Onvio confirma o tamanho pedido; com ela quando não confirma', async () => {
  const P = tamanhoDaPagina(), n = Math.max(1, P - 30);              // menos itens que a página: cabe numa chamada só
  const itens = k => Array.from({ length: k }, (_, i) => ({ id: 'a' + i, name: `f${i}.pdf`, mimeType: 'application/pdf' }));
  let chamadas = 0;
  const f = async url => { chamadas++; const de = +new URL(url).searchParams.get('from'); return { data: { itemsPerPage: tamanhoDaPagina(), items: itens(n).slice(de - 1, de - 1 + tamanhoDaPagina()) } }; };
  const r = await filhosDe(f, 'Folders', 'x'); assert.equal(r.length, n); assert.equal(chamadas, 1);
  chamadas = 0;
  const g = async url => { chamadas++; const de = +new URL(url).searchParams.get('from'); return { data: { items: itens(n).slice(de - 1, de - 1 + tamanhoDaPagina()) } }; };
  const r2 = await filhosDe(g, 'Folders', 'x'); assert.equal(r2.length, n); assert.equal(chamadas, n >= 100 ? 2 : 1);   // sem itemsPerPage: o mínimo seguro de antes
  chamadas = 0;
  const h = async url => { chamadas++; const de = +new URL(url).searchParams.get('from'); return { data: { itemsPerPage: 100, items: itens(250).slice(de - 1, de - 1 + 100) } }; };
  const r3 = await filhosDe(h, 'Folders', 'x'); assert.equal(r3.length, 250); assert.equal(chamadas, 3);     // o Onvio limitou a 100: lê tudo
});
test('velocidade: pasta que o Onvio diz vazia não é aberta, e nenhum arquivo deixa de ser lido', async () => {
  assert.equal(pastaSemNada({ hasChildren: false }), true);
  assert.equal(pastaSemNada({ hasFiles: false, hasFolders: false }), true);
  assert.equal(pastaSemNada({ hasFiles: true, hasFolders: false }), false);
  assert.equal(pastaSemNada({}), false);                                                                    // sem a informação, abre como antes
  const abertas = [];
  const f = async url => {
    if (url.includes('storage/v1/projects')) return { data: [{ id: 'P', name: 'Fiscal', hasChildren: true }, { id: 'V', name: 'Pessoal', hasChildren: false }] };
    const id = /\/(Projects|Folders)\/([^/]+)\/children/.exec(url)[2]; abertas.push(id);
    if (id === 'P') return { data: { items: [{ id: 'F1', name: '2026', type: 'folder', hasChildren: true }, { id: 'F2', name: 'vazia', type: 'folder', hasChildren: false }, { id: 'F3', name: 'semnada', type: 'folder', hasFiles: false, hasFolders: false }, { id: 'F4', name: 'semflag', type: 'folder' }] } };
    if (id === 'F1') return { data: { items: [{ id: 'd1', name: '10-2026 a.pdf', mimeType: 'application/pdf' }] } };
    if (id === 'F4') return { data: { items: [{ id: 'd4', name: 'b.pdf', mimeType: 'application/pdf' }] } };
    return { data: { items: [] } };
  };
  ESTAT.pastasVazias = 0;
  const r = await lerEmpresa(f, { ids: ['c'], nome: 'A', cnpj: '1' }, { conhecidas: ['Fiscal', 'Pessoal'], soConhecidas: true, descer: ['Fiscal', 'Pessoal'], rapido: true });
  assert.deepEqual(abertas.sort(), ['F1', 'F4', 'P']);                                                      // não abriu V, F2 nem F3
  assert.deepEqual(r.docs.filter(d => d.arquivo).map(d => d.arquivo).sort(), ['10-2026 a.pdf', 'b.pdf']);
  assert.equal(ESTAT.pastasVazias, 3);
});

test('leitura não para por erro do Onvio: 500 + 401 é falha comum; só 401 em tudo é sessão', async () => {
  const resp = (status, ct = 'application/json', body = '{}') => async () => ({ status, ct, body });
  const sem = { espera: async () => {} };
  const a = fetcherComFallback([{ via: 'página', f: resp(500) }, { via: 'origem', f: resp(401) }], sem);
  await assert.rejects(a(API + 'x'), e => !(e instanceof AuthError) && /500/.test(e.message));          // o caso do print: não é sessão
  const b = fetcherComFallback([{ via: 'página', f: resp(401) }, { via: 'origem', f: resp(403) }], sem);
  await assert.rejects(b(API + 'x'), e => e instanceof AuthError);
  const c = fetcherComFallback([{ via: 'página', f: resp(200, 'text/html', '<html>login</html>') }, { via: 'origem', f: resp(401) }], sem);
  await assert.rejects(c(API + 'x'), e => e instanceof AuthError);                                      // página de login também é sessão
  let n = 0; const d = fetcherComFallback([{ via: 'página', f: async () => (++n === 1 ? { status: 500, ct: '', body: '' } : { status: 200, ct: 'application/json', body: '{"ok":1}' }) }], sem);
  assert.deepEqual(await d(API + 'x'), { ok: 1 });                                                       // 500 passageiro: tenta de novo
});
test('uma empresa recusada não derruba a leitura de todas, se a sessão está viva', async () => {
  const clientes = ['1', '2', '3'].map(i => ({ ids: [i], codigo: i, nome: 'E' + i, cnpj: i.repeat(14), inativo: false }));
  let sessaoOk = true;
  const f = async url => {
    if (url.includes('session-and-bindings')) { if (sessaoOk) return {}; throw new AuthError('HTTP 401'); }
    if (url.includes('primaryAssociationId=2')) throw new AuthError('Tentativas: recusado');                 // só a empresa 2
    if (url.includes('storage/v1/projects')) return { data: [{ id: 'P' + url.match(/primaryAssociationId=(\d)/)[1], name: 'Fiscal' }] };
    return { data: { items: [{ id: 'd', name: '10-2026 a.pdf', mimeType: 'application/pdf' }] } };
  };
  const r = await coletar(f, clientes, { conhecidas: ['Fiscal'], descer: ['Fiscal'], rapido: true, paralelo: 2 });
  assert.equal(r.qualidade.lidas, 2); assert.equal(r.qualidade.falhas, 1);                                // seguiu com as outras
  sessaoOk = false;
  await assert.rejects(coletar(f, clientes, { conhecidas: ['Fiscal'], descer: ['Fiscal'], rapido: true }), e => e instanceof AuthError);   // sessão caiu: para
});

test('medição: a data da pasta cobre o que está dentro? (só conta, não muda a leitura)', async () => {
  const f = async url => {
    if (url.includes('storage/v1/projects')) return { data: [{ id: 'P', name: 'Fiscal', hasChildren: true, modifiedDate: '2026-11-01T10:00:00Z' }] };
    const id = /\/(Projects|Folders)\/([^/]+)\/children/.exec(url)[2];
    if (id === 'P') return { data: { items: [{ id: 'F', name: '2026', type: 'folder', hasChildren: true, createdDate: '2026-01-01T00:00:00Z', modifiedDate: '2026-11-10T09:00:00Z' }] } };
    if (id === 'F') return { data: { items: [{ id: 'd', name: '11-2026 a.pdf', mimeType: 'application/pdf', createdDate: '2026-11-10T09:00:30Z' }] } };
    return { data: { items: [] } };
  };
  ESTAT.datas = { projetos: 0, projetosOk: 0, pastas: 0, pastasOk: 0 };
  const r = await lerEmpresa(f, { ids: ['c'], nome: 'A', cnpj: '1' }, { conhecidas: ['Fiscal'], soConhecidas: true, descer: ['Fiscal'], rapido: true });
  assert.equal(r.docs.filter(d => d.arquivo).length, 1);                       // a leitura continua igual
  assert.deepEqual(ESTAT.datas, { projetos: 1, projetosOk: 0, pastas: 1, pastasOk: 1 });   // o departamento NÃO acompanhou; a subpasta acompanhou
});
