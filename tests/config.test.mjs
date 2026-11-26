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
test('padrão oficial: MM-AAAA antes do nome do arquivo', () => {
  const p = DEFAULT_CONFIG.filePattern;
  for (const ok of ['10-2026 Folha de pagamento.pdf', '01-2027 NFe entradas.xml', '12-2026 x']) assert.equal(testFileName(p, ok), true, ok);
  for (const ruim of ['scan0001.pdf', '2026-11 - NFE - entradas.pdf', '13-2026 Folha.pdf', '00-2026 Folha.pdf', '10-2026Folha.pdf', '10-2026 ', 'Folha 10-2026.pdf', '10-26 Folha.pdf']) assert.equal(testFileName(p, ruim), false, ruim);
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
  assert.match(errors[0].msg, /4 caracteres/);
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
test('CNPJ alfanumérico (padrão novo) valida e formata', () => {
  assert.equal(isValidCnpj('12.ABC.345/01DE-35'), true);
  assert.equal(isValidCnpj('12.ABC.345/01DE-36'), false);
  assert.equal(formatCnpj('12ABC34501DE35'), '12.ABC.345/01DE-35');
});

test('config antiga com a lista de pastas da 1ª versão é atualizada (evita alarme falso nas pastas padrão do Onvio)', async () => {
  const antiga = ['Contábil', 'Fiscal', 'Pessoal', 'Financeiro', 'Comunicados'];
  await saveConfig({ ...DEFAULT_CONFIG, allowedFolders: antiga });
  const c = await loadConfig();
  for (const n of ['Administrativo', 'Certidão Negativa de Débito', 'Contabilidade', 'Patrimônio', 'Registro de Empresas']) assert.ok(c.allowedFolders.includes(n), n);
  await saveConfig({ ...DEFAULT_CONFIG, allowedFolders: ['Minha Pasta'] });                       // lista que a pessoa escolheu: respeitada
  assert.deepEqual((await loadConfig()).allowedFolders, ['Minha Pasta']);
});

import { definirGrupos, chaveDoGrupo, raizesDoGrupo, raizesParaLer, gruposDoTexto, gruposParaTexto } from '../src/config.js';
import { statusEnvio, demandaDe, checkSemEnvio } from '../src/rules.js';
test('grupos de empresas: raízes diferentes valem como uma empresa', () => {
  definirGrupos([{ nome: 'Atacapet', cnpjs: ['25096492000191', '66675807000132', '66702493000110'] }]);
  assert.equal(chaveDoGrupo('66675807'), '25096492');
  assert.deepEqual(raizesDoGrupo('66702493'), ['25096492', '66675807', '66702493']);
  assert.equal(chaveDoGrupo('11222333'), '11222333');
  assert.deepEqual([...raizesParaLer([{ cnpj: '25096492000191' }])].sort(), ['25096492', '66675807', '66702493']);
  const t = [{ empresa: 'Atacapet', cnpj: '25096492000191', treinadoEm: '2026-01-01', demanda: ['Pessoal'] }];
  const now = new Date('2026-11-26T12:00:00Z');
  // a RB (outra raiz) enviou há 5 dias: a Atacapet inteira está em uso
  const r = statusEnvio([{ cnpj: '66675807000132', origem: 'cliente', data: '2026-11-21' }], t, now, {});
  assert.equal(r[0].dias, 5);
  // demanda só na YB vale para o grupo
  assert.equal(demandaDe({ '25096492': [], '66702493': ['Fiscal'] }, '25096492000191').comDemanda, true);
  assert.equal(checkSemEnvio([], t, { diasSemEnvio: 90 }, now, {}, { '25096492': [], '66675807': [], '66702493': [] }).length, 0);
  definirGrupos([]);
  assert.equal(chaveDoGrupo('66675807'), '66675807');
});
test('grupos de empresas: texto <-> lista', () => {
  const g = gruposDoTexto('Atacapet: 25.096.492/0001-91, 66.675.807/0001-32\nsó um: 11.222.333/0001-81\nmesma raiz: 11.222.333/0001-81, 11.222.333/0002-62\nsem dois pontos');
  assert.equal(g.length, 1); assert.equal(g[0].nome, 'Atacapet'); assert.equal(g[0].cnpjs.length, 2);
  assert.match(gruposParaTexto(g), /^Atacapet: 25\.096\.492\/0001-91, 66\.675\.807\/0001-32$/);
});
