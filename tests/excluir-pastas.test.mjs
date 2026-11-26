import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoLixeira, lixeiraPermitida, leituraDeProjeto, urlProjeto, gruposExcluiveis, enviarPastasParaLixeira, liberadoComConteudo } from '../src/excluir-pastas.js';
import { leituraPermitida } from '../src/onvio-reader.js';

function onvio({ status = 201, recusa = {} } = {}) {
  const proj = new Map(), posts = [];
  const add = (id, name, { vazia = true, del = true } = {}) => proj.set(id, { id, name, hasChildren: !vazia, permissions: { delete: del } });
  const ler = async url => { const id = decodeURIComponent(url.split('/projects/')[1]); const p = proj.get(id); if (!p) throw new Error('HTTP 404'); return { data: p }; };
  const escrever = async ped => { posts.push(ped); if (recusa[ped.corpo.id]) return { status: recusa[ped.corpo.id] }; proj.delete(ped.corpo.id); return { status }; };
  return { add, ler, escrever, proj, posts };
}
const it = (id, pasta = 'zlkx-c') => ({ pastaId: id, empresa: 'A', cnpj: '1', pasta });

test('lista fechada: só POST storage/v1/trash/projects com { id }', () => {
  const ok = pedidoLixeira({ projetoId: 'abc-123' });
  assert.equal(lixeiraPermitida(ok), true);
  assert.equal(lixeiraPermitida({ ...ok, metodo: 'DELETE' }), false);
  assert.equal(lixeiraPermitida({ ...ok, metodo: 'PUT' }), false);
  assert.equal(lixeiraPermitida({ ...ok, url: ok.url.replace('trash/projects', 'trash/folders') }), false);
  assert.equal(lixeiraPermitida({ ...ok, url: ok.url.replace('onvio.com.br', 'outro.com') }), false);
  assert.equal(lixeiraPermitida({ ...ok, url: ok.url + '?x=1' }), false);
  assert.equal(lixeiraPermitida({ ...ok, corpo: { id: 'abc', extra: 1 } }), false);
  assert.equal(lixeiraPermitida({ ...ok, corpo: {} }), false);
  assert.equal(lixeiraPermitida({ ...ok, corpo: { id: '../x' } }), false);
  assert.equal(lixeiraPermitida(null), false);
  assert.equal(leituraDeProjeto(urlProjeto('p1')), true);
  assert.equal(leituraPermitida(urlProjeto('p1')), true);
  assert.equal(leituraPermitida('https://onvio.com.br/api/storage/v1/trash/projects'), false);        // a lixeira não é leitura
});
test('só pasta de primeiro nível que o Onvio diz vazia entra, agrupada por nome', () => {
  const g = gruposExcluiveis([
    { pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'a', vazia: true, podeExcluir: true, empresa: 'A', cnpj: '1' },
    { pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'b', vazia: false, podeExcluir: true, empresa: 'B', cnpj: '2' },
    { pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'c', vazia: null, podeExcluir: null, empresa: 'C', cnpj: '3' },
    { pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'd', vazia: true, podeExcluir: false, empresa: 'D', cnpj: '4' },
    { pasta: 'Victor Nascimento', pastaTipo: 'Projects', pastaId: 'e', vazia: true, podeExcluir: true, empresa: 'E', cnpj: '5' },
    { pasta: 'Cobrança', empresa: 'F', cnpj: '6', arquivos: 3 },                                  // veio de arquivo lido: não é projeto vazio
  ]);
  const z = g.find(x => x.nome === 'zlkx-c');
  assert.deepEqual(z.itens.map(i => i.pastaId), ['a']); assert.equal(z.comConteudo, 1); assert.equal(z.naoVerificadas, 2);
  assert.equal(g.find(x => x.nome === 'Victor Nascimento').itens.length, 1); assert.equal(g.some(x => x.nome === 'Cobrança'), false);
});
test('envia para a lixeira uma por vez, conferindo antes que está vazia', async () => {
  const o = onvio(); o.add('p1', 'zlkx-c'); o.add('p2', 'zlkx-c');
  const r = await enviarPastasParaLixeira([it('p1'), it('p2')], { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.deepEqual(r.feitos.map(f => f.pastaId), ['p1', 'p2']); assert.equal(r.parou, ''); assert.equal(o.posts.length, 2);
  assert.deepEqual(o.posts[0].corpo, { id: 'p1' });
});
test('nunca envia pasta com conteúdo, mudada, sem permissão de excluir ou sem id', async () => {
  const o = onvio(); o.add('p1', 'zlkx-c', { vazia: false }); o.add('p2', 'outro nome'); o.add('p3', 'zlkx-c', { del: false });
  const r = await enviarPastasParaLixeira([it('p1'), it('p2'), it('p3'), it(''), it('p9')], { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.deepEqual(r.falhas.map(f => f.motivo), ['com-conteudo', 'mudou', 'sem-permissao-excluir', 'sem-id', 'mudou']);
  assert.equal(o.posts.length, 0); assert.equal(r.feitos.length, 0);
});
test('hasChildren ausente (o Onvio não confirmou) não vale como vazia', async () => {
  const ler = async () => ({ data: { name: 'zlkx-c', permissions: { delete: true } } });
  const posts = [];
  const r = await enviarPastasParaLixeira([it('p1')], { ler, escrever: async p => { posts.push(p); return { status: 201 }; }, pausaMs: 0 });
  assert.equal(r.falhas[0].motivo, 'com-conteudo'); assert.equal(posts.length, 0);
});
test('para na primeira recusa de permissão, depois de 3 erros e a pedido', async () => {
  const o = onvio({ recusa: { p2: 403 } }); ['p1', 'p2', 'p3'].forEach(i => o.add(i, 'zlkx-c'));
  const r = await enviarPastasParaLixeira(['p1', 'p2', 'p3'].map(i => it(i)), { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(r.parou, 'sem-permissao'); assert.deepEqual(r.feitos.map(f => f.pastaId), ['p1']); assert.equal(o.posts.length, 2);
  const o2 = onvio({ status: 500 }); ['a', 'b', 'c', 'd'].forEach(i => o2.add(i, 'zlkx-c'));
  const r2 = await enviarPastasParaLixeira(['a', 'b', 'c', 'd'].map(i => it(i)), { ler: o2.ler, escrever: o2.escrever, pausaMs: 0 });
  assert.equal(r2.parou, 'erros'); assert.equal(o2.posts.length, 3);
  const o3 = onvio(); ['x', 'y'].forEach(i => o3.add(i, 'zlkx-c')); let n = 0;
  const r3 = await enviarPastasParaLixeira(['x', 'y'].map(i => it(i)), { ler: o3.ler, escrever: o3.escrever, pausaMs: 0, parar: () => n++ >= 1 });
  assert.equal(r3.parou, 'pedido'); assert.equal(r3.feitos.length, 1);
});

test('com conteúdo: só com a liberação explícita do nome (zlkx-c) e se o Onvio disser com clareza', async () => {
  assert.equal(liberadoComConteudo('zlkx-c', ['zlkx-c']), true); assert.equal(liberadoComConteudo('ZLKX-C', ['zlkx-c']), true);
  assert.equal(liberadoComConteudo('Victor Nascimento', ['zlkx-c']), false);
  const g = gruposExcluiveis([{ pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'a', vazia: false, podeExcluir: true, empresa: 'A', cnpj: '1' }, { pasta: 'zlkx-c', pastaTipo: 'Projects', pastaId: 'b', vazia: false, podeExcluir: false, empresa: 'B', cnpj: '2' }]);
  assert.deepEqual(g[0].itensComConteudo.map(i => i.pastaId), ['a']); assert.equal(g[0].comConteudo, 2); assert.equal(g[0].itens.length, 0);
  const o = onvio(); o.add('p1', 'zlkx-c', { vazia: false });
  const sem = await enviarPastasParaLixeira([it('p1')], { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(sem.falhas[0].motivo, 'com-conteudo'); assert.equal(o.posts.length, 0);                     // sem liberação, nada
  const com = await enviarPastasParaLixeira([it('p1')], { ler: o.ler, escrever: o.escrever, pausaMs: 0, incluirConteudo: true });
  assert.deepEqual(com.feitos.map(f => f.pastaId), ['p1']); assert.equal(o.posts.length, 1);
  const ler = async () => ({ data: { name: 'zlkx-c', permissions: { delete: true } } });                      // o Onvio não disse: nem com liberação
  const nd = await enviarPastasParaLixeira([it('p2')], { ler, escrever: async () => ({ status: 201 }), pausaMs: 0, incluirConteudo: true });
  assert.equal(nd.falhas[0].motivo, 'com-conteudo');
});
