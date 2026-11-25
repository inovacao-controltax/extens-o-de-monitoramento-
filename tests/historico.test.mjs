import test from 'node:test';
import assert from 'node:assert/strict';
import { atualizarHistorico, naoVistas, marcarVistas, evolucao, paraCsv, chaveDe, novoHistorico } from '../src/historico.js';

const t0 = new Date('2026-11-25T10:00:00Z'), em = h => new Date(t0.getTime() + h * 3600 * 1000);
const emp = (n, extra = {}) => ({ empresa: n, cnpj: n, ...extra });
const todos = new Set(['nomenclatura', 'pastas', 'semEnvio', 'notificacoes']);

test('primeira leitura só marca o ponto de partida: nada é novo', () => {
  const h = atualizarHistorico(null, { semEnvio: [emp('A', { dias: 40 })], pastas: [] }, t0, { prontos: new Set(['semEnvio', 'pastas']) });
  assert.deepEqual(h.novas, []);
  assert.deepEqual(h.bases.sort(), ['pastas', 'semEnvio']);
});
test('pendência que aparece depois vira novidade; a que já estava, não; a resolvida sai', () => {
  let h = atualizarHistorico(null, { semEnvio: [emp('A', { dias: 40 })] }, t0, { prontos: new Set(['semEnvio']) });
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 41 }), emp('B', { dias: null })] }, em(1), { prontos: new Set(['semEnvio']) });
  assert.deepEqual(h.novas.map(n => [n.k, n.texto, n.visto]), [['semEnvio', 'B: nenhum envio registrado', false]]);
  assert.equal(naoVistas(h).length, 1);
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 42 })] }, em(2), { prontos: new Set(['semEnvio']) });       // B resolveu
  assert.deepEqual(h.novas, []);
});
test('monitor que ainda não está pronto não vira "tudo novo" quando fica pronto', () => {
  let h = atualizarHistorico(null, { pastas: [{ empresa: 'A', cnpj: '1', pasta: 'X' }], notificacoes: [] }, t0, { prontos: new Set(['pastas']) });
  h = atualizarHistorico(h, { pastas: [{ empresa: 'A', cnpj: '1', pasta: 'X' }], notificacoes: [{ nome: 'Ana', motivo: 'm' }, { nome: 'Bia', motivo: 'm' }] }, em(1), { prontos: todos });
  assert.deepEqual(h.novas, []);                        // notificações entraram agora: partida, não novidade
  h = atualizarHistorico(h, { pastas: [{ empresa: 'A', cnpj: '1', pasta: 'X' }], notificacoes: [{ nome: 'Ana', motivo: 'm' }, { nome: 'Bia', motivo: 'm' }, { nome: 'Cris', motivo: 'm' }] }, em(2), { prontos: todos });
  assert.deepEqual(h.novas.map(n => n.texto), ['Cris: m']);
});
test('leitura em andamento (monitor fora dos prontos) não mexe no que já se sabia', () => {
  let h = atualizarHistorico(null, { pastas: [{ empresa: 'A', cnpj: '1', pasta: 'X' }] }, t0, { prontos: new Set(['pastas']) });
  const antes = JSON.stringify(h.atual);
  h = atualizarHistorico(h, { pastas: [] }, em(1), { prontos: new Set() });
  assert.equal(JSON.stringify(h.atual), antes);
  assert.deepEqual(h.novas, []);
});
test('marcar como vistas mantém a lista mas zera o aviso', () => {
  let h = atualizarHistorico(null, { semEnvio: [] }, t0, { prontos: new Set(['semEnvio']) });
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 31 })] }, em(1), { prontos: new Set(['semEnvio']) });
  assert.equal(naoVistas(h).length, 1);
  const v = marcarVistas(h);
  assert.equal(naoVistas(v).length, 0); assert.equal(v.novas.length, 1);
  assert.equal(marcarVistas(null), null);
});
test('novidades com mais de 14 dias saem; a série guarda uma linha por hora ou quando muda', () => {
  let h = atualizarHistorico(null, { semEnvio: [] }, t0, { prontos: new Set(['semEnvio']) });
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 31 })] }, em(1), { prontos: new Set(['semEnvio']) });
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 31 })] }, em(1.1), { prontos: new Set(['semEnvio']) });   // igual e há pouco: sem linha nova
  assert.equal(h.serie.length, 2);
  h = atualizarHistorico(h, { semEnvio: [emp('A', { dias: 31 })] }, em(24 * 15), { prontos: new Set(['semEnvio']) });
  assert.deepEqual(h.novas, []);
});
test('evolução: agora contra 7 dias atrás', () => {
  let h = null;
  const passos = [[0, 2], [24 * 3, 3], [24 * 7, 4], [24 * 8, 5]];
  for (const [hora, n] of passos) h = atualizarHistorico(h, { semEnvio: Array.from({ length: n }, (_, i) => emp('E' + i)) }, em(hora), { prontos: new Set(['semEnvio']) });
  const e = evolucao(h, 7, em(24 * 8));
  assert.deepEqual(e.map(x => [x.k, x.agora, x.antes, x.delta]), [['semEnvio', 5, 2, 3]]);
  assert.deepEqual(evolucao(null), []);
});
test('chaves estáveis e CSV com BOM, ; e aspas', () => {
  assert.equal(chaveDe('pastas', { cnpj: '1', pasta: 'X' }), 'pastas|1|X');
  assert.equal(chaveDe('notificacoes', { nome: 'Ana' }), 'notificacoes|Ana|');
  const csv = paraCsv([['Monitor', 'Empresa'], ['Sem envio', 'A; "B"\nlinha']]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv.split('\r\n')[1], 'Sem envio;"A; ""B"" linha"');
  assert.deepEqual(Object.keys(novoHistorico()).sort(), ['atual', 'bases', 'fontes', 'novas', 'serie', 'v']);
});
