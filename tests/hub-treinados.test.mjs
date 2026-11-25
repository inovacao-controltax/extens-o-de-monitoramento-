import test from 'node:test';
import assert from 'node:assert/strict';
import { treinadosParaConfig, MOTIVOS } from '../src/hub-treinados.js';

test('resposta do Hub vira lista da configuração: CNPJ válido, setores conhecidos, sem repetir', () => {
  const { rows, descartadas } = treinadosParaConfig([
    { empresa: 'Alfa', cnpj: '11.222.333/0001-81', treinadoEm: '2026-10-09', demanda: ['Pessoal', 'Fiscal', 'Outro'] },
    { empresa: 'Alfa de novo', cnpj: '11222333000181', treinadoEm: '2026-10-10', demanda: ['Fiscal'] },
    { empresa: 'Sem CNPJ', cnpj: '123', demanda: ['Fiscal'] },
    { empresa: 'Sem data', cnpj: '12.ABC.345/01DE-35', treinadoEm: 'ontem', demanda: [] },
  ]);
  assert.deepEqual(rows.map(r => [r.empresa, r.cnpj, r.treinadoEm, r.demanda]), [
    ['Alfa', '11222333000181', '2026-10-09', ['Pessoal', 'Fiscal']],
    ['Sem data', '12ABC34501DE35', '', []],
  ]);
  assert.deepEqual(descartadas, ['Sem CNPJ']);
});
test('entrada inválida não quebra', () => {
  assert.deepEqual(treinadosParaConfig(null), { rows: [], descartadas: [] });
  assert.deepEqual(treinadosParaConfig([null, {}]).rows, []);
});
test('todo motivo de falha tem texto em português para a tela', () => {
  for (const m of ['sem-codigo', 'sem-hub', 'sem-ponte', 'token', 'sem-resposta', 'acao']) assert.ok(MOTIVOS[m] && MOTIVOS[m].length > 20, m);
});
