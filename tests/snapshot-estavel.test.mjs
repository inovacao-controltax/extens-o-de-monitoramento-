import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotEstavel } from '../src/snapshot.js';
const snap = (o = {}) => ({ fonte: 'onvio', docs: [], qualidade: { lidas: 1 }, ...o });
test('leitura terminada vale; leitura em andamento mostra a última completa (números não sobem e descem)', () => {
  const completo = snap({ coletadoEm: 1, marca: 'completo' });
  assert.equal(snapshotEstavel(snap({ marca: 'novo' }), completo).marca, 'novo');
  const lendo = snapshotEstavel(snap({ lendo: true, parcial: true, marca: 'parcial' }), completo);
  assert.equal(lendo.marca, 'completo'); assert.equal(lendo._atualizando, true);
  assert.equal(snapshotEstavel(snap({ parcial: true, lendo: false, marca: 'interrompida' }), completo).marca, 'completo');
});
test('primeira leitura (sem completo): só há o parcial; sem nada, nada; exemplo não conta', () => {
  assert.equal(snapshotEstavel(snap({ lendo: true, marca: 'p' }), null).marca, 'p');
  assert.equal(snapshotEstavel(null, null), null);
  assert.equal(snapshotEstavel({ fonte: 'exemplo' }, null), null);
  assert.equal(snapshotEstavel(null, snap({ marca: 'c' })).marca, 'c');
});
