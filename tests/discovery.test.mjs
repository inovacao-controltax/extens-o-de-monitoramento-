import test from 'node:test';
import assert from 'node:assert/strict';
import { splitExt, shapeOf, regexFromShape, discoverNames, discoverFolders } from '../src/discovery.js';
import { trainedFromHub } from '../src/hub-sync.js';

test('formato de um nome', () => {
  assert.deepEqual(splitExt('2026-11 - NFE - x.PDF'), { base: '2026-11 - NFE - x', ext: 'pdf' });
  assert.equal(shapeOf('2026-11 - NFE - entradas'), '9{4}-9{2} - X - X');
  assert.equal(shapeOf('IMG_2231'), 'X_9{4}');
  assert.equal(shapeOf('folha novembro final(2)'), 'X(9{1})');
});
test('descoberta agrupa por formato e gera regex que aceita os exemplos', () => {
  const nomes = ['2026-11 - NFE - a.pdf', '2026-10 - FOLHA - b.pdf', '2026-09 - NFE - c.xml', 'scan0001.pdf', 'scan0002.pdf'];
  const r = discoverNames(nomes);
  assert.equal(r.total, 5);
  assert.equal(r.formatos[0].count, 3);
  assert.equal(r.formatos[0].pct, 60);
  assert.deepEqual(r.formatos[0].exts, ['pdf', 'xml']);
  const re = new RegExp(r.formatos[0].regex, 'i');
  assert.ok(['2026-11 - NFE - a.pdf', '2026-09 - NFE - c.xml'].every(n => re.test(n)));
  assert.equal(re.test('scan0001.pdf'), false);
  assert.equal(r.formatos[1].shape, 'X9{4}');
});
test('descoberta ignora linhas vazias', () => {
  assert.equal(discoverNames(['', '  ', 'a.pdf']).total, 1);
});
test('pastas de primeiro nível, com / ou \\', () => {
  const r = discoverFolders(['Fiscal/2026/11/a.pdf', 'Fiscal\\2026\\b.pdf', 'Pessoal/c.pdf', 'Docs Diversos/d.pdf', 'solto.pdf']);
  assert.equal(r.total, 4);
  assert.deepEqual(r.pastas.map(p => [p.nome, p.count, p.setor]), [['Fiscal', 2, true], ['Pessoal', 1, true], ['Docs Diversos', 1, false]]);
});

const emp = [{ id: 'e1', nome: 'Alfa', cnpj: '11.222.333/0001-81' }, { id: 'e2', nome: 'Beta', cnpj: '12.ABC.345/01DE-35' }, { id: 'e3', nome: 'Gama', cnpj: '11222333000181' }, { id: 'e4', nome: 'Sem contato', cnpj: '11222333000181' }];
test('Hub: 100% treinado, parcial, não iniciado e sem contatos', () => {
  const contatos = [
    { empresaId: 'e1', setores: ['pessoal', 'fiscal'], statusTreinamento: 'concluido', concluidoEm: '2026-09-10T12:00:00Z' },
    { empresaId: 'e1', setores: ['fiscal'], statusTreinamento: 'concluido', concluidoEm: '2026-10-02' },
    { empresaId: 'e2', setores: ['contabil'], statusTreinamento: 'concluido', concluidoEm: '2026-08-01' },
    { empresaId: 'e2', setores: ['contabil'], statusTreinamento: 'pendente' },
    { empresaId: 'e3', setores: ['pessoal'], statusTreinamento: 'agendado' },
  ];
  const r = trainedFromHub({ empresas: emp, contatos });
  assert.deepEqual(r.map(x => x.empresa), ['Alfa', 'Beta']);
  assert.deepEqual(r[0], { empresa: 'Alfa', cnpj: '11222333000181', treinadoEm: '2026-10-02', demanda: ['Pessoal', 'Fiscal'], parcial: false });
  assert.equal(r[1].parcial, true);
  assert.equal(r[1].cnpj, '12ABC34501DE35');
});
test('Hub: contato em andamento já conta como treinado parcial; setor sem início deixa a empresa parcial', () => {
  const r = trainedFromHub({ empresas: emp, contatos: [
    { empresaId: 'e1', setores: ['pessoal'], statusTreinamento: 'andamento' },
    { empresaId: 'e1', setores: ['fiscal'], statusTreinamento: 'pendente' },
  ] });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].demanda, ['Pessoal']);
  assert.equal(r[0].parcial, true);
  assert.equal(r[0].treinadoEm, '');
});
