import test from 'node:test';
import assert from 'node:assert/strict';
import { proporNome, competenciasNoTexto, competenciaDoCaminho, planoDeCorrecao } from '../src/corrigir-nomes.js';
import { DEFAULT_CONFIG, compilePattern } from '../src/config.js';
const { re } = compilePattern(DEFAULT_CONFIG.filePattern);
const p = (a, pasta = '') => proporNome(a, pasta, re);
test('competência no nome vai para a frente, em qualquer formato', () => {
  assert.equal(p('2026-10 Folha.pdf').novo, '10-2026 Folha.pdf');
  assert.equal(p('Folha 10-2026.pdf').novo, '10-2026 Folha.pdf');
  assert.equal(p('Folha de pagamento - 10.2026.pdf').novo, '10-2026 Folha de pagamento.pdf');
  assert.equal(p('1-2026 Extrato.xlsx').novo, '01-2026 Extrato.xlsx');
  assert.equal(p('Recibos outubro 2026.pdf').novo, '10-2026 Recibos.pdf');
  assert.equal(p('Março de 2026 Balancete.pdf').novo, '03-2026 Balancete.pdf');
  assert.equal(p('10_2026_Guia FGTS.pdf').novo, '10-2026 Guia FGTS.pdf');
});
test('data completa não vira competência; sem competência usa a pasta; sem nenhuma, não chuta', () => {
  assert.equal(competenciasNoTexto('Boleto 15-10-2026.pdf').length, 0);
  assert.equal(competenciasNoTexto('Nota 2026-10-15.pdf').length, 0);
  assert.equal(p('Boleto 15-10-2026.pdf').motivo, 'sem-competencia');
  assert.deepEqual(p('Folha.pdf', 'Pessoal/2026/11'), { ok: true, novo: '11-2026 Folha.pdf', de: 'pasta' });
  assert.deepEqual(p('Folha.pdf', 'Pessoal/11-2026'), { ok: true, novo: '11-2026 Folha.pdf', de: 'pasta' });
  assert.equal(p('Folha.pdf', 'Pessoal').motivo, 'sem-competencia');
  assert.equal(p('Folha.pdf', 'Pessoal/2026/11/2025/03').motivo, 'sem-competencia');            // pasta ambígua
});
test('ambígua, sem nome e já no padrão', () => {
  assert.equal(p('Folha 09-2026 e 10-2026.pdf').motivo, 'competencia-ambigua');
  assert.equal(p('10-2026.pdf').motivo, 'sem-nome');
  assert.equal(p('10-2026 Folha.pdf').motivo, 'ja-no-padrao');
  assert.equal(p('Folha 13-2026.pdf').motivo, 'sem-competencia');
});
test('plano: prontas, duplicados e sem identificador ficam à parte', () => {
  const linhas = [
    { cnpj: '1', pasta: 'Fiscal', arquivo: '2026-10 A.pdf', docId: 'a' },
    { cnpj: '1', pasta: 'Fiscal', arquivo: 'A 10-2026.pdf', docId: 'b' },          // dá o mesmo nome novo que a de cima
    { cnpj: '1', pasta: 'Fiscal', arquivo: '2026-09 B.pdf', docId: '' },
    { cnpj: '1', pasta: 'Fiscal', arquivo: '2026-08 C.pdf', docId: 'c' },
    { cnpj: '2', pasta: 'Fiscal', arquivo: 'Sem nada.pdf', docId: 'd' },
  ];
  const existentes = [{ cnpj: '1', pasta: 'Fiscal', arquivo: '08-2026 C.pdf' }];
  const r = planoDeCorrecao(linhas, re, existentes);
  assert.deepEqual(r.prontas.map(x => [x.docId, x.novo]), [['a', '10-2026 A.pdf']]);
  assert.deepEqual(r.pendentes.map(x => [x.docId || '-', x.motivo]), [['b', 'duplicado'], ['-', 'sem-id'], ['c', 'duplicado'], ['d', 'sem-competencia']]);
  assert.equal(competenciaDoCaminho('Fiscal/2026/11').m, 11);
});

test('competência colada MMAAAA entre separadores (recibos da DCTF Web); CNPJ e data completa não confundem', () => {
  assert.equal(p('Recibo_57485131000123_082026_40_00000500005302054.pdf').novo, '08-2026 Recibo_57485131000123_40_00000500005302054.pdf');
  assert.equal(p('NF 57485131000123.pdf').motivo, 'sem-competencia');
  assert.equal(p('Folha_15102026.pdf').motivo, 'sem-competencia');
  assert.equal(p('Guia 132026.pdf').motivo, 'sem-competencia');                     // mês 13 não existe
});
