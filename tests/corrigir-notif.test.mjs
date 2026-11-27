import test from 'node:test';
import assert from 'node:assert/strict';
import { OPCOES_NOTIF, corpoDoPadrao, pedidoNotif, notifPermitida, corrigirNotificacoes, desfazerNotificacoes } from '../src/corrigir-notif.js';
import { leituraPermitida } from '../src/onvio-reader.js';

const PADRAO = Object.fromEntries(OPCOES_NOTIF.map(k => [k, false])); PADRAO.newTopicEmail = true;
const C = n => String(n).padStart(32, 'a');
function onvio({ recusa = {} } = {}) {
  const cfg = new Map(), puts = [];
  const ler = async url => { const id = url.split('/').pop(); if (!cfg.has(id)) throw new Error('HTTP 404'); return { id, contactId: id, ...cfg.get(id) }; };
  const escrever = async p => { const m = /(service-requesting|br-payroll-sr)\/v1\/contact-notifications\/(\w+)$/.exec(p.url); puts.push([m[1], m[2]]); const r = recusa[`${m[1]}:${m[2]}`]; if (r) return { status: r }; if (m[1] === 'service-requesting') cfg.set(m[2], { ...p.corpo }); return { status: 200 }; };
  return { cfg, puts, ler, escrever };
}

test('lista fechada: só os dois PUT de contact-notifications com as 12 opções sim/não', () => {
  const ok = pedidoNotif('service-requesting', C(1), PADRAO);
  assert.equal(notifPermitida(ok), true);
  assert.equal(notifPermitida(pedidoNotif('br-payroll-sr', C(1), PADRAO)), true);
  assert.equal(notifPermitida(pedidoNotif('cnd', C(1), PADRAO)), false);                       // CND, BOX-e etc. não
  assert.equal(notifPermitida({ ...ok, metodo: 'DELETE' }), false);
  assert.equal(notifPermitida({ ...ok, metodo: 'POST' }), false);
  assert.equal(notifPermitida({ ...ok, url: ok.url.replace('onvio.com.br', 'x.com') }), false);
  assert.equal(notifPermitida({ ...ok, corpo: { ...PADRAO, extra: true } }), false);
  assert.equal(notifPermitida({ ...ok, corpo: { ...PADRAO, newTicketEmail: 'sim' } }), false);
  const { newTicketEmail, ...faltando } = PADRAO; assert.equal(notifPermitida({ ...ok, corpo: faltando }), false);
  assert.equal(leituraPermitida(ok.url), true);                                                 // a leitura do mesmo endereço continua sendo só GET
  assert.equal(corpoDoPadrao({ ...PADRAO, id: 'x', apiVersion: '1' }).newTopicEmail, true);
  assert.equal(corpoDoPadrao({ newTicketEmail: false }), null);                                 // padrão incompleto: não corrige
});
test('coloca no padrão um por vez, gravando nas Solicitações e nas listas da folha, e guarda o antes', async () => {
  const o = onvio(); o.cfg.set(C(1), { ...PADRAO, newTicketEmail: true, newTicketSystem: true }); o.cfg.set(C(2), { ...PADRAO });
  const r = await corrigirNotificacoes([{ nome: 'Ana', contato: C(1) }, { nome: 'Igual', contato: C(2) }, { nome: 'Nunca salvou', contato: C(3) }, { nome: 'Sem id', contato: '' }], PADRAO, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.deepEqual(r.feitos.map(f => f.nome), ['Ana']); assert.equal(r.feitos[0].antes.newTicketEmail, true);
  assert.deepEqual(o.puts, [['service-requesting', C(1)], ['br-payroll-sr', C(1)]]);
  assert.deepEqual(r.falhas.map(f => f.motivo), ['ja-no-padrao', 'sem-config', 'sem-contato']);
  assert.deepEqual(o.cfg.get(C(1)), PADRAO);
});
test('para na recusa de permissão; gravação só em uma das duas fica como parcial', async () => {
  const o = onvio({ recusa: { [`service-requesting:${C(2)}`]: 403 } }); [1, 2, 3].forEach(i => o.cfg.set(C(i), { ...PADRAO, newTicketEmail: true }));
  const r = await corrigirNotificacoes([1, 2, 3].map(i => ({ nome: 'F' + i, contato: C(i) })), PADRAO, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(r.parou, 'sem-permissao'); assert.deepEqual(r.feitos.map(f => f.nome), ['F1']);
  const o2 = onvio({ recusa: { [`br-payroll-sr:${C(1)}`]: 500 } }); o2.cfg.set(C(1), { ...PADRAO, newTicketEmail: true });
  const r2 = await corrigirNotificacoes([{ nome: 'F1', contato: C(1) }], PADRAO, { ler: o2.ler, escrever: o2.escrever, pausaMs: 0 });
  assert.equal(r2.feitos[0].parcial, true); assert.equal(r2.falhas[0].motivo, 'parcial');
  const r3 = await corrigirNotificacoes([{ nome: 'F1', contato: C(1) }], null, { ler: o2.ler, escrever: o2.escrever, pausaMs: 0 });
  assert.equal(r3.parou, 'sem-padrao'); assert.equal(r3.feitos.length, 0);                    // sem padrão lido: nada é gravado
});
test('desfazer volta a configuração de antes, só se ainda estiver como a extensão deixou', async () => {
  const o = onvio(); const antes = { ...PADRAO, newTicketEmail: true }; o.cfg.set(C(1), { ...antes });
  const r = await corrigirNotificacoes([{ nome: 'Ana', contato: C(1) }], PADRAO, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  const d = await desfazerNotificacoes(r.feitos, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(d.feitos.length, 1); assert.deepEqual(o.cfg.get(C(1)), antes);
  const d2 = await desfazerNotificacoes(r.feitos, { ler: o.ler, escrever: o.escrever, pausaMs: 0 });
  assert.equal(d2.feitos.length, 0);                                                             // já voltou: não mexe de novo
});
