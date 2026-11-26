import test from 'node:test';
import assert from 'node:assert/strict';
import { pedidoRenomear, escritaPermitida, leituraDeConferencia, urlMetadados, corrigirNomes, desfazerNomes } from '../src/corrigir-escrita.js';
import { leituraPermitida } from '../src/onvio-reader.js';
import { DEFAULT_CONFIG, compilePattern } from '../src/config.js';
const { re } = compilePattern(DEFAULT_CONFIG.filePattern);

// Onvio simulado: guarda o nome de cada arquivo; PUT troca o nome.
function onvio({ recusa = {}, status = 200 } = {}) {
  const docs = new Map(), puts = [];
  const add = (pasta, id, name) => docs.set(`${pasta}/${id}`, { pasta, id, name });
  const ler = async url => { const m = /folders\/([^/]+)\/documents\/([^/]+)\/metadata/.exec(url); const d = docs.get(`${m[1]}/${m[2]}`); if (!d) throw new Error('HTTP 404'); return { data: { id: d.id, name: d.name, containerId: d.pasta } }; };
  const escrever = async p => { puts.push(p); const m = /folders\/([^/]+)\/documents\/([^/]+)$/.exec(p.url); if (recusa[m[2]]) return { status: recusa[m[2]] }; const d = docs.get(`${m[1]}/${m[2]}`); if (!d) return { status: 404 }; d.name = p.corpo.name; return { status }; };
  return { add, ler, escrever, docs, puts };
}
const item = (id, de, para, extra = {}) => ({ docId: id, pastaId: 'P1', pastaTipo: 'Folders', arquivo: de, novo: para, empresa: 'A', cnpj: '1', ...extra });

test('lista fechada: só o PUT de renomear com { name, id, containerId } coerentes', () => {
  const ok = pedidoRenomear({ pastaId: 'P1', docId: 'D1', novoNome: '10-2026 Folha.pdf' });
  assert.equal(escritaPermitida(ok), true);
  assert.equal(escritaPermitida({ ...ok, metodo: 'DELETE' }), false);
  assert.equal(escritaPermitida({ ...ok, metodo: 'POST' }), false);
  assert.equal(escritaPermitida({ ...ok, url: ok.url.replace('onvio.com.br', 'outro.com') }), false);
  assert.equal(escritaPermitida({ ...ok, url: ok.url + '?x=1' }), false);
  assert.equal(escritaPermitida({ ...ok, url: ok.url.replace('/documents/D1', '/documents') }), false);
  assert.equal(escritaPermitida({ ...ok, corpo: { ...ok.corpo, extra: 1 } }), false);
  assert.equal(escritaPermitida({ ...ok, corpo: { name: 'x', id: 'D1' } }), false);
  assert.equal(escritaPermitida({ ...ok, corpo: { ...ok.corpo, containerId: 'OUTRA' } }), false);          // corpo diferente da rota
  assert.equal(escritaPermitida({ ...ok, corpo: { ...ok.corpo, name: 'a/b.pdf' } }), false);
  assert.equal(escritaPermitida({ ...ok, corpo: { ...ok.corpo, name: '  ' } }), false);
  assert.equal(escritaPermitida(null), false);
  assert.equal(leituraDeConferencia(urlMetadados('P1', 'D1')), true);
  assert.equal(leituraPermitida(urlMetadados('P1', 'D1')), true);
  assert.equal(leituraPermitida('https://onvio.com.br/api/storage/v1/folders/P1/documents/D1'), false);      // o PUT/GET sem /metadata não é leitura
});
test('corrige um por vez, confere antes e registra o nome antigo', async () => {
  const o = onvio(); o.add('P1', 'D1', '2026-10 Folha.pdf'); o.add('P1', 'D2', 'Guia 11-2026.pdf');
  const r = await corrigirNomes([item('D1', '2026-10 Folha.pdf', '10-2026 Folha.pdf'), item('D2', 'Guia 11-2026.pdf', '11-2026 Guia.pdf')], { ler: o.ler, escrever: o.escrever, padrao: re, pausaMs: 0 });
  assert.deepEqual(r.feitos.map(f => [f.de, f.para]), [['2026-10 Folha.pdf', '10-2026 Folha.pdf'], ['Guia 11-2026.pdf', '11-2026 Guia.pdf']]);
  assert.equal(r.parou, ''); assert.equal(o.docs.get('P1/D1').name, '10-2026 Folha.pdf'); assert.equal(o.puts.length, 2);
});
test('não altera o que mudou desde a leitura, o nome fora do padrão, o que está na raiz do projeto nem sem id', async () => {
  const o = onvio(); o.add('P1', 'D1', 'já mudou.pdf'); o.add('P1', 'D2', 'a.pdf'); o.add('P1', 'D3', 'b.pdf');
  const r = await corrigirNomes([item('D1', '2026-10 Folha.pdf', '10-2026 Folha.pdf'), item('D2', 'a.pdf', 'sem competência.pdf'), item('D3', 'b.pdf', '10-2026 b.pdf', { pastaTipo: 'Projects' }), item('', 'c.pdf', '10-2026 c.pdf')], { ler: o.ler, escrever: o.escrever, padrao: re, pausaMs: 0 });
  assert.deepEqual(r.falhas.map(f => f.motivo), ['mudou', 'fora-do-padrao', 'raiz-do-projeto', 'sem-id']);
  assert.equal(o.puts.length, 0); assert.equal(r.feitos.length, 0);
});
test('para na primeira recusa de permissão e depois de 3 erros seguidos', async () => {
  const o = onvio({ recusa: { D2: 403 } }); ['D1', 'D2', 'D3'].forEach(i => o.add('P1', i, `x${i}.pdf`));
  const r = await corrigirNomes(['D1', 'D2', 'D3'].map(i => item(i, `x${i}.pdf`, `10-2026 x${i}.pdf`)), { ler: o.ler, escrever: o.escrever, padrao: re, pausaMs: 0 });
  assert.equal(r.parou, 'sem-permissao'); assert.deepEqual(r.feitos.map(f => f.docId), ['D1']); assert.equal(o.puts.length, 2);
  const o2 = onvio({ status: 500 }); ['A', 'B', 'C', 'D'].forEach(i => o2.add('P1', i, `x${i}.pdf`));
  const r2 = await corrigirNomes(['A', 'B', 'C', 'D'].map(i => item(i, `x${i}.pdf`, `10-2026 x${i}.pdf`)), { ler: o2.ler, escrever: o2.escrever, padrao: re, pausaMs: 0 });
  assert.equal(r2.parou, 'erros'); assert.equal(o2.puts.length, 3);
});
test('parar a pedido e desfazer a rodada', async () => {
  const o = onvio(); ['D1', 'D2'].forEach(i => o.add('P1', i, `${i}-antigo.pdf`));
  let n = 0;
  const r = await corrigirNomes(['D1', 'D2'].map(i => item(i, `${i}-antigo.pdf`, `10-2026 ${i}.pdf`)), { ler: o.ler, escrever: o.escrever, padrao: re, pausaMs: 0, parar: () => n++ >= 1 });
  assert.equal(r.parou, 'pedido'); assert.equal(r.feitos.length, 1);
  const d = await desfazerNomes(r.feitos, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(d.feitos.length, 1); assert.equal(o.docs.get('P1/D1').name, 'D1-antigo.pdf');
  const d2 = await desfazerNomes(r.feitos, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });             // já voltou: o nome atual não é o novo
  assert.equal(d2.feitos.length, 0); assert.equal(d2.falhas[0].motivo, 'mudou');
});
