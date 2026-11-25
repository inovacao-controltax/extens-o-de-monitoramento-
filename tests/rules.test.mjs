import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config.js';
import { setorDaPasta, checkNomenclatura, checkPastas, checkSemEnvio, checkNotificacoes, analyze } from '../src/rules.js';

const NOW = new Date('2026-11-25T15:00:00Z');
const cfg = { ...DEFAULT_CONFIG, trained: [] };
const doc = (o = {}) => ({ empresa: 'A', cnpj: '1', pasta: 'Fiscal/2026/11', arquivo: '11-2026 NFE x.pdf', data: '2026-11-20', origem: 'cliente', ...o });

test('setor pela pasta, sem diferenciar acento e maiúscula', () => {
  assert.equal(setorDaPasta('contabil/2026'), 'Contábil');
  assert.equal(setorDaPasta('Fiscal'), 'Fiscal');
  assert.equal(setorDaPasta('Docs Diversos/x'), 'Outro');
});
test('nomenclatura: só cliente, só nomes fora do padrão', () => {
  const r = checkNomenclatura([doc(), doc({ arquivo: 'scan0001.pdf' }), doc({ arquivo: 'qualquer.pdf', origem: 'escritorio' })], cfg);
  assert.equal(r.length, 1);
  assert.equal(r[0].arquivo, 'scan0001.pdf');
  assert.equal(r[0].setor, 'Fiscal');
});
test('nomenclatura: regex inválido não quebra nem acusa tudo', () => {
  assert.deepEqual(checkNomenclatura([doc({ arquivo: 'x' })], { ...cfg, filePattern: '(' }), []);
});
test('pastas: agrupa por empresa e pasta, ignora permitidas e raiz', () => {
  const r = checkPastas([doc({ pasta: 'FISCAL/x' }), doc({ pasta: 'NOVA PASTA' }), doc({ pasta: 'nova pasta/b' }), doc({ pasta: '' })], cfg);
  assert.deepEqual(r, [{ empresa: 'A', cnpj: '1', pasta: 'NOVA PASTA', arquivos: 2 }]);
});
test('sem envio: limite de dias é "maior que", não "maior ou igual"', () => {
  const t = [{ empresa: 'A', cnpj: '1', treinadoEm: '2026-01-01', demanda: ['Fiscal'] }];
  const em = n => [doc({ data: new Date(NOW - n * 864e5).toISOString().slice(0, 10) })];
  assert.equal(checkSemEnvio(em(30), t, cfg, NOW).length, 0);
  const r = checkSemEnvio(em(31), t, cfg, NOW);
  assert.equal(r.length, 1); assert.equal(r[0].dias, 31);
});
test('sem envio: nunca enviou entra, mas recém-treinado tem carência', () => {
  const t = [
    { empresa: 'Velho', cnpj: '2', treinadoEm: '2026-08-01', demanda: [] },
    { empresa: 'Novo', cnpj: '3', treinadoEm: '2026-11-15', demanda: [] },
    { empresa: 'SemData', cnpj: '4', treinadoEm: '', demanda: [] },
  ];
  const r = checkSemEnvio([], t, cfg, NOW);
  assert.deepEqual(r.map(x => x.empresa), ['Velho', 'SemData']);
  assert.equal(r[0].dias, null);
});
test('sem envio: envio do escritório não conta como envio do cliente', () => {
  const t = [{ empresa: 'A', cnpj: '1', treinadoEm: '2026-01-01', demanda: [] }];
  assert.equal(checkSemEnvio([doc({ origem: 'escritorio' })], t, cfg, NOW).length, 1);
});
test('sem envio: respeita os dias da configuração', () => {
  const t = [{ empresa: 'A', cnpj: '1', treinadoEm: '2026-01-01', demanda: [] }];
  const d = [doc({ data: '2026-11-05' })]; // 20 dias
  assert.equal(checkSemEnvio(d, t, { ...cfg, diasSemEnvio: 15 }, NOW).length, 1);
  assert.equal(checkSemEnvio(d, t, { ...cfg, diasSemEnvio: 25 }, NOW).length, 0);
});
test('notificações: aviso desligado com tarefas; ignora quem não tem tarefa', () => {
  const r = checkNotificacoes([
    { nome: 'A', notificaTarefa: false, tarefasAtivas: 2 }, { nome: 'B', notificaTarefa: true, tarefasAtivas: 9 },
    { nome: 'C', notificaTarefa: false, tarefasAtivas: 0 }, { nome: 'D', notificaTarefa: false, tarefasAtivas: 7 },
  ]);
  assert.deepEqual(r.map(x => x.nome), ['D', 'A']);
});
test('analyze: usa treinados da configuração; se vazio, os do snapshot', () => {
  const snap = { docs: [], trained: [{ empresa: 'S', cnpj: '9', treinadoEm: '2026-01-01', demanda: [] }], users: [] };
  assert.equal(analyze(snap, cfg, NOW).semEnvio[0].empresa, 'S');
  const c2 = { ...cfg, trained: [{ empresa: 'C', cnpj: '8', treinadoEm: '2026-01-01', demanda: [] }] };
  assert.equal(analyze(snap, c2, NOW).semEnvio[0].empresa, 'C');
});

test('pastas: projeto que só entrou pelo nome (sem arquivo lido) conta 0 arquivos', () => {
  const r = checkPastas([doc({ pasta: 'Docs Diversos', arquivo: '', origem: 'sistema' })], cfg);
  assert.deepEqual(r, [{ empresa: 'A', cnpj: '1', pasta: 'Docs Diversos', arquivos: 0 }]);
});
