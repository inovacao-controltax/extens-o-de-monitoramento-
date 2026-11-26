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
      { id: h(1), created: '2026-11-05T10:00:00Z', lastUpdated: '2026-11-24T10:00:00Z', clientExpanded: { code: '10' } },   // aberta há pouco pelo cliente
      { id: h(2), created: '2026-09-01T10:00:00Z', lastUpdated: '2026-11-22T10:00:00Z', clientExpanded: { code: '99' } },   // antiga, movimentada há pouco (empresa fora da lista)
      { id: h(3), created: '2026-09-01T10:00:00Z', lastUpdated: '2026-09-02T10:00:00Z', clientExpanded: { code: '10' } },   // antiga
    ],
    'br-payroll-sr/v1/payroll-entries': [{ id: h(4), created: '2026-09-10T10:00:00Z', lastUpdated: '2026-11-20T10:00:00Z', clientExpanded: { code: '20' } }],
  };
  const topicos = {
    [h(1)]: [{ created: '2026-11-05T10:00:00Z', status: 1 }, { created: '2026-11-23T10:00:00Z', status: 3 }],     // cliente respondeu em 23/11
    [h(2)]: [{ created: '2026-09-01T10:00:00Z', status: 1 }, { created: '2026-11-22T10:00:00Z', status: 2 }],     // só o escritório mexeu depois
    [h(4)]: [{ created: '2026-09-10T10:00:00Z', status: 1 }, { created: '2026-11-19T10:00:00Z', status: 11 }],   // rubricas: 11 é do cliente
  };
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
const JANELA = { desde: '2026-01-01', recorte: '2026-10-26' };
test('abertura recente já mostra uso (sem ler trâmites); solicitação antiga movimentada só vale se o CLIENTE respondeu', async () => {
  const { f, chamadas } = fakeSolic();
  const r = await lerEnviosPorSolicitacao(f, ['10', '20'], JANELA);
  assert.deepEqual(r.porCodigo, { 10: '2026-11-05', 20: '2026-11-19' });        // 10: pela abertura; 20: a abertura é antiga, mas o cliente respondeu em 19/11
  assert.equal(r.tramites, 1);                                                  // só a da empresa 20 precisou dos trâmites
  assert.ok(chamadas.every(u => /^https:\/\/onvio\.com\.br\/api\//.test(u)));
  assert.equal(chamadas.filter(u => !/\/topics/.test(u)).length, LISTAS.length);
});
test('empresa que precisa de data exata (treinada) também lê as respostas recentes', async () => {
  const { f } = fakeSolic();
  const r = await lerEnviosPorSolicitacao(f, ['10'], { ...JANELA, precisos: ['10'] });
  assert.deepEqual(r.porCodigo, { 10: '2026-11-23' });
});
test('todas as empresas: a que só o escritório mexeu mostra a abertura antiga, nunca uma data do escritório', async () => {
  const { f } = fakeSolic();
  const r = await lerEnviosPorSolicitacao(f, null, JANELA);
  assert.deepEqual(r.porCodigo, { 10: '2026-11-05', 20: '2026-11-19', 99: '2026-09-01' });
});
test('lista sem acesso (403/404) não derruba as outras e é avisada; sessão caída interrompe', async () => {
  const a = fakeSolic({ falha: { 'service-requesting/v1/tickets/generic': 403 } });
  const r = await lerEnviosPorSolicitacao(a.f, null, JANELA);
  assert.deepEqual(r.porCodigo, { 20: '2026-11-19' });
  assert.deepEqual(r.semAcesso, ['geral']);
  await assert.rejects(lerEnviosPorSolicitacao(async () => { throw new AuthError('sessão'); }, ['10'], JANELA), AuthError);
  assert.deepEqual((await lerEnviosPorSolicitacao(async () => ({ items: [] }), [], {})).porCodigo, {});
});

const trained = [{ empresa: 'Alfa', cnpj: '1', treinadoEm: '2026-08-01', demanda: ['Fiscal'] }, { empresa: 'Beta', cnpj: '2', treinadoEm: '2026-08-01', demanda: [] }];
const agora = new Date('2026-11-25T12:00:00Z');
test('sem envio: vale o mais recente entre arquivo e solicitação; mostra de onde veio', () => {
  const docs = [{ cnpj: '1', origem: 'cliente', data: '2026-09-01' }];
  const r = checkSemEnvio(docs, trained, { ...DEFAULT_CONFIG, diasSemEnvio: 30 }, agora, { 1: '2026-11-20' });
  assert.deepEqual(r.map(x => x.cnpj), ['2']);                // Alfa usou o portal por solicitação há 5 dias
  const r2 = checkSemEnvio(docs, trained, { ...DEFAULT_CONFIG, diasSemEnvio: 30 }, agora, {});
  assert.deepEqual(r2.map(x => [x.cnpj, x.dias, x.fonte]), [['2', null, ''], ['1', 85, 'arquivo']]);
  const r3 = checkSemEnvio([], trained, { ...DEFAULT_CONFIG, diasSemEnvio: 30 }, agora, { 2: '2026-09-30' });
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

import { raizDoCnpj } from '../src/rules.js';
test('matriz e filiais são uma empresa só: o Hub e o Onvio podem cadastrar estabelecimentos diferentes do mesmo grupo (caso Atacapet)', () => {
  assert.equal(raizDoCnpj('25.096.492/0013-25'), raizDoCnpj('25096492000191'));
  assert.notEqual(raizDoCnpj('25096492000191'), raizDoCnpj('11222333000181'));
  const treinada = [{ empresa: 'Atacapet', cnpj: '25096492001325', treinadoEm: '2026-09-01', demanda: ['Fiscal'] }];        // cadastro do Hub: filial 0013
  // o Onvio mostra a matriz (0001), com solicitação recente e arquivo antigo
  const r = statusEnvio([{ cnpj: '25096492000191', origem: 'cliente', data: '2023-07-11' }], treinada, agora, { '25096492000191': '2026-11-20' });
  assert.deepEqual([r[0].dias, r[0].fonte], [5, 'solicitação']);
  assert.deepEqual(checkSemEnvio([], treinada, DEFAULT_CONFIG, agora, { '25096492000144': '2026-11-20' }), []);      // outra filial (0012-44) também vale
  assert.deepEqual(raizDoCnpj('12.ABC.345/01DE-35'), '12ABC345');
  assert.equal(raizDoCnpj(''), '');
});
