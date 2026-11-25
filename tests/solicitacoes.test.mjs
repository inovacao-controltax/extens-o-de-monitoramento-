import test from 'node:test';
import assert from 'node:assert/strict';
import { ultimaAtividadeDoCliente, lerEnviosPorSolicitacao, LISTAS } from '../src/solicitacoes.js';
import { checkSemEnvio, silenciadaAgora, analyze } from '../src/rules.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { API, AuthError } from '../src/onvio-reader.js';

const h = n => n.toString(16).padStart(32, '0');
test('atividade do cliente: abertura e trâmites do cliente contam, com ou sem anexo; trâmite do escritório não', () => {
  const t = { items: [
    { created: '2026-11-01T10:00:00Z', status: 1 },                                  // abertura (cliente)
    { created: '2026-11-03T10:00:00Z', status: 2, attachmentsExpanded: [{ id: 'x' }] }, // escritório (mesmo com anexo)
    { created: '2026-11-10T10:00:00Z', status: 3 },                                  // cliente respondeu
    { created: '2026-11-20T10:00:00Z', status: 4 },                                  // escritório
    { created: '2026-11-25T10:00:00Z', status: 3, deletedTopic: true },              // apagado: ignora
  ] };
  assert.equal(ultimaAtividadeDoCliente(t, [1, 3]), '2026-11-10');
  assert.equal(ultimaAtividadeDoCliente({ items: [] }, [1, 3]), '');
  assert.equal(ultimaAtividadeDoCliente(null, [1, 3]), '');
});

function fakeSolic({ falha = {} } = {}) {
  const chamadas = [];
  const tickets = {
    'service-requesting/v1/tickets/generic': [
      { id: h(1), lastUpdated: '2026-11-24T10:00:00Z', clientExpanded: { code: '10' } },
      { id: h(2), lastUpdated: '2026-11-22T10:00:00Z', clientExpanded: { code: '99' } },   // empresa não acompanhada
      { id: h(3), lastUpdated: '2026-09-01T10:00:00Z', clientExpanded: { code: '10' } },   // fora da janela
    ],
    'br-payroll-sr/v1/payroll-entries': [{ id: h(4), lastUpdated: '2026-11-20T10:00:00Z', clientExpanded: { code: '20' } }],
  };
  const topicos = { [h(1)]: [{ created: '2026-11-05T10:00:00Z', status: 1 }, { created: '2026-11-23T10:00:00Z', status: 3 }], [h(4)]: [{ created: '2026-11-19T10:00:00Z', status: 1 }] };
  const f = async url => {
    chamadas.push(url);
    const u = new URL(url), p = u.pathname.slice(5);
    if (falha[p]) throw new Error('HTTP ' + falha[p]);
    if (tickets[p]) return { items: tickets[p], totalItems: tickets[p].length };
    const m = /\/([0-9a-f]{32})\/topics$/.exec(p);
    if (m) return { items: topicos[m[1]] || [] };
    return { items: [] };
  };
  return { f, chamadas };
}
test('lê as listas, só as empresas acompanhadas e dentro da janela; devolve código -> último dia do cliente', async () => {
  const { f, chamadas } = fakeSolic();
  const r = await lerEnviosPorSolicitacao(f, ['10', '20'], { desde: '2026-10-26' });
  assert.deepEqual(r.porCodigo, { 10: '2026-11-23', 20: '2026-11-19' });
  assert.equal(chamadas.filter(u => /\/topics/.test(u)).length, 2);          // só trâmites das solicitações acompanhadas e recentes
  assert.ok(chamadas.every(u => /^https:\/\/onvio\.com\.br\/api\//.test(u)));
  assert.equal(chamadas.filter(u => !/\/topics/.test(u)).length, LISTAS.length);
});
test('lista sem acesso (403/404) não derruba as outras; sessão caída interrompe', async () => {
  const a = fakeSolic({ falha: { 'service-requesting/v1/tickets/generic': 403 } });
  assert.deepEqual((await lerEnviosPorSolicitacao(a.f, ['20'], { desde: '2026-10-26' })).porCodigo, { 20: '2026-11-19' });
  await assert.rejects(lerEnviosPorSolicitacao(async () => { throw new AuthError('sessão'); }, ['10'], { desde: '2026-10-26' }), AuthError);
  assert.deepEqual((await lerEnviosPorSolicitacao(async () => ({ items: [] }), [], {})).porCodigo, {});
});

const trained = [{ empresa: 'Alfa', cnpj: '1', treinadoEm: '2026-08-01', demanda: ['Fiscal'] }, { empresa: 'Beta', cnpj: '2', treinadoEm: '2026-08-01', demanda: [] }];
const agora = new Date('2026-11-25T12:00:00Z');
test('sem envio: vale o mais recente entre arquivo e solicitação; mostra de onde veio', () => {
  const docs = [{ cnpj: '1', origem: 'cliente', data: '2026-09-01' }];
  const r = checkSemEnvio(docs, trained, DEFAULT_CONFIG, agora, { 1: '2026-11-20' });
  assert.deepEqual(r.map(x => x.cnpj), ['2']);                // Alfa usou o portal por solicitação há 5 dias
  const r2 = checkSemEnvio(docs, trained, DEFAULT_CONFIG, agora, {});
  assert.deepEqual(r2.map(x => [x.cnpj, x.dias, x.fonte]), [['2', null, ''], ['1', 85, 'arquivo']]);
  const r3 = checkSemEnvio([], trained, DEFAULT_CONFIG, agora, { 2: '2026-09-30' });
  assert.deepEqual(r3.map(x => [x.cnpj, x.dias, x.fonte]), [['1', null, ''], ['2', 56, 'solicitação']]);
});
test('silenciar: com data vale até ela; sem data vale sempre; vencida volta a aparecer', () => {
  assert.equal(silenciadaAgora({ cnpj: '1', ate: '2026-12-01' }, agora), true);
  assert.equal(silenciadaAgora({ cnpj: '1', ate: '2026-11-25' }, agora), true);
  assert.equal(silenciadaAgora({ cnpj: '1', ate: '2026-11-24' }, agora), false);
  assert.equal(silenciadaAgora({ cnpj: '1', ate: '' }, agora), true);
  const cfg = { ...DEFAULT_CONFIG, trained, silenciadas: [{ cnpj: '1', ate: '2026-12-31', motivo: 'sem movimento' }, { cnpj: '2', ate: '2026-11-01', motivo: 'velho' }] };
  const a = analyze({ docs: [], trained: [] }, cfg, agora);
  assert.deepEqual(a.semEnvio.map(x => x.cnpj), ['2']);
});

import { statusEnvio } from '../src/rules.js';
test('statusEnvio: todas as treinadas, com dias e origem; nunca some empresa', () => {
  const r = statusEnvio([{ cnpj: '1', origem: 'cliente', data: '2026-11-10' }, { cnpj: '1', origem: 'escritorio', data: '2026-11-24' }], trained, agora, { 2: '2026-11-20' });
  assert.deepEqual(r.map(x => [x.cnpj, x.dias, x.fonte]), [['1', 15, 'arquivo'], ['2', 5, 'solicitação']]);     // arquivo do escritório não conta
  assert.equal(statusEnvio([], trained, agora, null).every(x => x.dias === null && x.fonte === ''), true);
});
