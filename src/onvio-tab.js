// Fetcher do Onvio pela aba que o usuário já abriu e logou (mesma sessão da página). SÓ GET, só rotas da lista fechada.
// Nada de token ou cookie passa pela extensão: o fetch roda dentro da aba e devolve só o corpo da resposta.
import { guardar, AuthError } from './onvio-reader.js';

const dorme = ms => new Promise(r => setTimeout(r, ms));
export async function abaOnvio() {
  const abas = await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  const pronta = t => !t.discarded && t.status === 'complete';
  return abas.find(t => t.active && pronta(t)) || abas.find(pronta) || abas[0] || null;
}
export const visaoCliente = tab => { try { return /^\/clientcenter(\/|$)/i.test(new URL(tab.url).pathname); } catch (e) { return false; } };

function lerResposta(v) {
  const tipo = String(v.ct || '').split(';')[0] || 'sem tipo';
  if (v.status === 401 || v.status === 403) throw new AuthError('HTTP ' + v.status);
  if (v.status >= 300 && v.status < 400) throw new AuthError('redirecionou (HTTP ' + v.status + ')');
  if (v.status < 200 || v.status >= 300) throw new Error('HTTP ' + v.status);
  if (!/json/i.test(v.ct || '')) throw new AuthError('o Onvio devolveu uma página (' + tipo + ') em vez de dados');
  try { return JSON.parse(v.body); } catch (e) { throw new Error('resposta inválida do Onvio'); }
}

export async function criarFetcher() {
  const tab = await abaOnvio();
  if (!tab) throw new AuthError('Não há aba do Onvio aberta. Abra https://onvio.com.br, faça login e tente de novo.');
  if (visaoCliente(tab)) throw new AuthError('A aba do Onvio está na visão do cliente. Use o acesso do escritório.');
  const bruto = async url => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', args: [url],
      func: async u => {
        try {
          if (!u.startsWith('https://onvio.com.br/api/')) return { status: 0, ct: '', body: 'endereço fora do Onvio' };
          const r = await fetch(u, { credentials: 'include' });
          return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
        } catch (e) { return { status: 0, ct: '', body: String(e) }; }
      },
    });
    return (res && res.result) || { status: 0, ct: '', body: 'sem resposta da aba' };
  };
  return guardar(async url => {
    let v = await bruto(url);
    if (v.status === 503) { await dorme(800); v = await bruto(url); }          // o Onvio às vezes responde 503 na 1ª tentativa
    if (v.status === 429) { await dorme(3000); v = await bruto(url); }         // pediu calma: espera e tenta uma vez
    if (v.status === 0) throw new Error('falha de rede (' + String(v.body).slice(0, 80) + ')');
    return lerResposta(v);
  });
}
export const pausa = dorme;
