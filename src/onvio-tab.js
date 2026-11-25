// Fetcher do Onvio pela aba que o usuário já abriu e logou (mesma sessão da página). SÓ GET, só rotas da lista fechada.
// Nada de token ou cookie passa pela extensão: o fetch roda dentro da aba e devolve só o corpo da resposta.
// Dois jeitos, o que funcionar fica: mundo da página (como a própria página) e mundo isolado da extensão (mesma origem).
import { guardar, AuthError, fetcherComFallback } from './onvio-reader.js';

const dorme = ms => new Promise(r => setTimeout(r, ms));
export async function abaOnvio() {
  const abas = await chrome.tabs.query({ url: 'https://onvio.com.br/*' });
  const pronta = t => !t.discarded && t.status === 'complete';
  return abas.find(t => t.active && pronta(t)) || abas.find(pronta) || abas[0] || null;
}
export const visaoCliente = tab => { try { return /^\/clientcenter(\/|$)/i.test(new URL(tab.url).pathname); } catch (e) { return false; } };

const buscar = async u => {
  try {
    if (!u.startsWith('https://onvio.com.br/api/')) return { status: 0, ct: '', body: 'endereço fora do Onvio' };
    const r = await fetch(u, { credentials: 'include' });
    return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
  } catch (e) { return { status: 0, ct: '', body: String(e) }; }
};

export async function criarFetcher({ onChamada } = {}) {
  const tab = await abaOnvio();
  if (!tab) throw new AuthError('Não há aba do Onvio aberta. Abra https://onvio.com.br, faça login e tente de novo.');
  if (visaoCliente(tab)) throw new AuthError('A aba do Onvio está na visão do cliente. Use o acesso do escritório.');
  const por = mundo => async url => {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: mundo, args: [url], func: buscar });
    return (res && res.result) || { status: 0, ct: '', body: 'sem resposta da aba' };
  };
  const base = fetcherComFallback([{ via: 'mundo da página', f: por('MAIN') }, { via: 'mundo isolado da extensão', f: por('ISOLATED') }]);
  const g = guardar(base, onChamada);
  Object.defineProperty(g, 'via', { get: () => base.via || '' });
  return g;
}
export const pausa = dorme;
