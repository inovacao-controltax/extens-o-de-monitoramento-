import test from 'node:test';
import assert from 'node:assert/strict';
import { API, leituraPermitida, guardar, perfilDaSessao, listarClientes, filhosDe, origemDoDocumento, lerEmpresa, coletar, diagnosticar, textoDoRelatorio, camposDe, AuthError } from '../src/onvio-reader.js';
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
  assert.deepEqual(clientes[0], { ids: ['f1', 'c1'], codigo: '1', nome: 'E1', cnpj: '11222333000181', inativo: false });
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
