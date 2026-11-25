import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isValidCnpj, formatCnpj, validateConfig, testFileName, parseTrained, mergeTrained, loadConfig, saveConfig } from '../src/config.js';

test('CNPJ: válido, dígito errado e tamanho errado', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-82'), false);
  assert.equal(isValidCnpj('1122233300018'), false);
  assert.equal(isValidCnpj('11111111111111'), false);
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
});
test('padrão de nome de exemplo', () => {
  const p = DEFAULT_CONFIG.filePattern;
  assert.equal(testFileName(p, '2026-11 - NFE - entradas.pdf'), true);
  assert.equal(testFileName(p, 'scan0001.pdf'), false);
  assert.equal(testFileName(p, ''), null);
  assert.equal(testFileName('(', 'x'), null);
});
test('validação da configuração', () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), {});
  const e = validateConfig({ ...DEFAULT_CONFIG, filePattern: '(', allowedFolders: [], diasSemEnvio: 0 });
  assert.ok(e.filePattern.startsWith('Expressão inválida'));
  assert.ok(e.allowedFolders && e.diasSemEnvio);
});
test('importação de treinados: linhas boas e ruins', () => {
  const txt = 'Empresa;CNPJ;Treinado em;Demanda\nAlfa Ltda;11.222.333/0001-81;01/09/2026;pessoal, Fiscal\nBeta;1234;01/09/2026;Fiscal\nGama;11222333000181;31-12;Fiscal\nDelta;11222333000181;;Rh';
  const { rows, errors } = parseTrained(txt);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { empresa: 'Alfa Ltda', cnpj: '11222333000181', treinadoEm: '2026-09-01', demanda: ['Pessoal', 'Fiscal'] });
  assert.deepEqual(errors.map(e => e.linha), [3, 4, 5]);
  assert.match(errors[0].msg, /4 dígitos/);
});
test('mesclar por CNPJ substitui e ordena', () => {
  const a = [{ empresa: 'Zeta', cnpj: '1' }, { empresa: 'Alfa', cnpj: '2' }];
  const m = mergeTrained(a, [{ empresa: 'Beta', cnpj: '1' }]);
  assert.deepEqual(m.map(x => x.empresa), ['Alfa', 'Beta']);
});
test('salvar e carregar (memória), e recusa config inválida', async () => {
  assert.equal((await saveConfig({ ...DEFAULT_CONFIG, diasSemEnvio: 99 })).ok, true);
  assert.equal((await loadConfig()).diasSemEnvio, 99);
  assert.equal((await saveConfig({ ...DEFAULT_CONFIG, diasSemEnvio: 0 })).ok, false);
  assert.equal((await loadConfig()).diasSemEnvio, 99);
});
test('mensagem de regex inválido sem prefixo técnico', () => {
  const e = validateConfig({ ...DEFAULT_CONFIG, filePattern: '(' });
  assert.match(e.filePattern, /^Expressão inválida: Unterminated group\./);
});
