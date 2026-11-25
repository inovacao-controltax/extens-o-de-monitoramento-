import test from 'node:test';
import assert from 'node:assert/strict';
import { montarAviso, linkZimbra, MENSAGEM_PADRAO, ASSUNTO_PADRAO } from '../src/aviso.js';
import { DEFAULT_CONFIG } from '../src/config.js';

test('texto do aviso: variáveis trocadas, com a última atividade quando existe', () => {
  const a = montarAviso(DEFAULT_CONFIG, { empresa: 'Alfa Ltda', dias: 41, data: '2026-10-15' });
  assert.equal(a.assunto, 'Portal do Cliente · Alfa Ltda');
  assert.match(a.corpo, /a Alfa Ltda não usa o Portal do Cliente há 41 dias \(a última atividade foi em 15\/10\/2026\)\./);
  assert.match(a.corpo, /Atenciosamente,\nEquipe ControlTax$/);
  assert.doesNotMatch(a.corpo, /\{[a-z]+\}/);
});
test('sem nenhum envio registrado: não inventa número de dias', () => {
  const a = montarAviso(DEFAULT_CONFIG, { empresa: 'Beta', dias: null });
  assert.match(a.corpo, /não usa o Portal do Cliente há muito tempo\./);
  assert.doesNotMatch(a.corpo, /null|NaN|undefined|dias dias/);
});
test('texto e assinatura personalizados valem', () => {
  const a = montarAviso({ ...DEFAULT_CONFIG, msgAviso: 'Oi, {empresa}: {dias} dias{ultima}. {assinatura}', msgAssinatura: 'Josué' }, { empresa: 'Gama', dias: 33, data: '2026-10-23' });
  assert.equal(a.corpo, 'Oi, Gama: 33 dias (a última atividade foi em 23/10/2026). Josué');
});
test('guarda: o texto padrão nunca pede documento assinado, termo nem atestado', () => {
  for (const t of [MENSAGEM_PADRAO, ASSUNTO_PADRAO]) assert.doesNotMatch(t, /assinad|termo|atestado|carta|procura[cç]/i);
});
test('link do Zimbra: rascunho de verdade, sem destinatário, com & + % protegidos', () => {
  const l = linkZimbra('https://mail.controltax.com.br/?x=1#y', { assunto: 'A & B', corpo: 'Oferta 50% + frete\nlinha 2' });
  assert.ok(l.startsWith('https://mail.controltax.com.br/?view=compose&to=&subject='));
  const u = new URL(l);
  assert.equal(u.searchParams.get('subject'), 'A ＆ B');
  assert.equal(u.searchParams.get('body'), 'Oferta 50％ ＋ frete\nlinha 2');
  assert.equal(u.searchParams.get('to'), '');
  assert.ok(linkZimbra('', { assunto: 'x', corpo: 'y' }).startsWith('https://mail.controltax.com.br/?view=compose'));
});
test('link do Zimbra: só https; endereço estranho volta ao padrão', () => {
  for (const ruim of ['javascript:alert(1)', 'http://mail.x.com/', 'ftp://x', 'mail.controltax.com.br', 'https://a b.com']) assert.ok(linkZimbra(ruim, { assunto: 'a', corpo: 'b' }).startsWith('https://mail.controltax.com.br/?view=compose'), ruim);
  assert.ok(linkZimbra('https://webmail.outro.com.br/x/', { assunto: 'a', corpo: 'b' }).startsWith('https://webmail.outro.com.br/x/?view=compose'));
});
