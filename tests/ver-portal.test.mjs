import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alvoSeguro, comoNavegar, casaTexto, pedidoValeAqui, urlDoOnvio, voltaDaUrl, voltaSegura, VALIDADE_VER_MS, URL_NOTIF_PADRAO } from '../src/ver-portal.js';

test('"ver no portal": só endereço do Onvio do escritório', () => {
  assert.equal(urlDoOnvio('/staff/#/documents/folders/F3'), 'https://onvio.com.br/staff/#/documents/folders/F3');
  assert.equal(urlDoOnvio('https://onvio.com.br/staff/#/x'), 'https://onvio.com.br/staff/#/x');
  assert.equal(urlDoOnvio('https://evil.com/staff'), '');
  assert.equal(urlDoOnvio('http://onvio.com.br/staff'), '');
  assert.equal(urlDoOnvio('https://u:p@onvio.com.br/staff'), '');
  assert.equal(urlDoOnvio('https://onvio.com.br.evil.com/'), '');
  assert.equal(urlDoOnvio('https://onvio.com.br/clientcenter/#/x'), '', 'nunca a visão do cliente');
  assert.equal(urlDoOnvio('javascript:alert(1)'), '');
  assert.equal(urlDoOnvio(URL_NOTIF_PADRAO), URL_NOTIF_PADRAO, 'a tela de notificações do Portal do Cliente vale de fábrica');
});

test('"ver no portal": o pedido do painel é conferido (lista conhecida, texto curto, endereço do Onvio)', () => {
  assert.equal(alvoSeguro({ k: 'outra' }), null);
  assert.equal(alvoSeguro(null), null);
  const a = alvoSeguro({ k: 'nomenclatura', id: 'D3', titulo: 'T', url: 'https://evil.com/', linhas: [['Empresa', 'Gama\n Ltda'], ['', 'x'], 'lixo', ['Pasta', 'P'.repeat(500)]], destaque: 'a.pdf', acao: 'Voltar e corrigir', copiado: 'sim', extra: 1 });
  assert.equal(a.url, '');
  assert.deepEqual(a.linhas.map(l => l[0]), ['Empresa', 'Pasta']);
  assert.equal(a.linhas[0][1], 'Gama Ltda');
  assert.equal(a.linhas[1][1].length, 240);
  assert.equal(a.copiado, false);
  assert.equal('extra' in a, false);
});

test('"ver no portal": navegar sem recarregar quando é a mesma página do Onvio', () => {
  assert.equal(comoNavegar('https://onvio.com.br/staff/#/home', 'https://onvio.com.br/staff/#/documents/folders/F3'), 'hash');
  assert.equal(comoNavegar('https://onvio.com.br/br-portal-do-cliente/', 'https://onvio.com.br/staff/#/documents/folders/F3'), 'abrir');
  assert.equal(comoNavegar('https://onvio.com.br/staff/#/x', 'https://onvio.com.br/staff/#/x'), 'ficar');
  assert.equal(comoNavegar('https://onvio.com.br/staff/#/x', ''), 'ficar');
});

test('"ver no portal": a barra só volta depois da recarga, na página certa e por 2 min', () => {
  const g = { alvo: { url: 'https://onvio.com.br/staff/#/documents/folders/F3' }, em: 1000 };
  assert.equal(pedidoValeAqui(g, 'https://onvio.com.br/staff/#/documents/folders/F3', 2000), true);
  assert.equal(pedidoValeAqui(g, 'https://onvio.com.br/staff/#/home', 2000), true, 'o Onvio pode trocar o # ao abrir');
  assert.equal(pedidoValeAqui(g, 'https://onvio.com.br/br-portal-do-cliente/', 2000), false, 'outra aplicação do Onvio');
  const n = { alvo: { url: URL_NOTIF_PADRAO }, em: 1000 };
  assert.equal(pedidoValeAqui(n, 'https://onvio.com.br/br-portal-do-cliente/settings/notifications', 2000), true);
  assert.equal(pedidoValeAqui(n, 'https://onvio.com.br/br-portal-do-cliente/settings/notifications?x=1', 2000), true, 'a página pode completar o endereço');
  assert.equal(pedidoValeAqui(n, 'https://onvio.com.br/staff/#/documents', 2000), false);
  assert.equal(pedidoValeAqui(g, 'https://onvio.com.br/staff/', 1000 + VALIDADE_VER_MS + 1), false);
  assert.equal(pedidoValeAqui(null, 'https://onvio.com.br/staff/', 2000), false);
});

test('"ver no portal": o nome do item na tela (igual, dentro de um texto curto ou cortado com reticências)', () => {
  assert.equal(casaTexto('Sem competencia.pdf', 'Sem competencia.pdf'), 2);
  assert.equal(casaTexto('  sem   COMPETENCIA.pdf ', 'Sem competencia.pdf'), 2);
  assert.equal(casaTexto('Documentos › Gama › zlkx-c', 'zlkx-c'), 1);
  assert.equal(casaTexto('Relatorio de folha mensal…', 'Relatorio de folha mensal de outubro.pdf'), 1);
  assert.equal(casaTexto('Rel…', 'Relatorio.pdf'), 0, 'corte curto demais');
  assert.equal(casaTexto('x '.repeat(80) + 'zlkx-c', 'zlkx-c'), 0, 'nunca no meio de um parágrafo');
  assert.equal(casaTexto('outra coisa', 'zlkx-c'), 0);
  assert.equal(casaTexto('Apuração COMPETE', 'Apuração COMPETE.zip'), 1, 'o Onvio pode mostrar o nome sem a extensão');
  assert.equal(casaTexto('Apu', 'Apu.zip'), 0, 'nome curto demais sem a extensão');
});

test('"ver no portal": a volta para a extensão só aceita lista conhecida', () => {
  assert.deepEqual(voltaDaUrl('?camada=1&volta=pastas&linha=PJ9'), { k: 'pastas', id: 'PJ9', corrigir: false });
  assert.deepEqual(voltaDaUrl('?camada=1&volta=nomenclatura&linha=D3&corrigir=1'), { k: 'nomenclatura', id: 'D3', corrigir: true });
  assert.equal(voltaDaUrl('?camada=1&volta=config'), null);
  assert.equal(voltaDaUrl(''), null);
  assert.deepEqual(voltaSegura({ k: 'envios', id: '11444777000161', corrigir: 'sim' }), { k: 'envios', id: '11444777000161', corrigir: false });
  assert.equal(voltaSegura({ k: 'coleta' }), null);
});
