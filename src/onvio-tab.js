// Fetcher do Onvio pela aba que o usuário já abriu e logou (mesma sessão da página). SÓ GET, só rotas da lista fechada.
// Nada de token ou cookie passa pela extensão: o fetch roda dentro da aba e devolve só o corpo da resposta.
// Dois jeitos, o que funcionar fica: mundo da página (como a própria página) e mundo isolado da extensão (mesma origem).
import { guardar, AuthError, fetcherComFallback } from './onvio-reader.js';
import { escritaPermitida } from './corrigir-escrita.js';
import { lixeiraPermitida } from './excluir-pastas.js';

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

// Escrita (só a correção de nomes, ver corrigir-escrita.js): o PUT roda DENTRO da aba, com a sessão dela. Se o Onvio recusar só com a sessão (401/403), tenta
// como a própria tela faz, com a credencial curta da sessão (POST security/v1/jwt/sessions); essa credencial fica só dentro desta função, nunca sai da página.
async function escreverNaPagina(pedido) {
  const tentar = async auth => {
    const h = { 'Content-Type': 'application/json' }; if (auth) h.Authorization = 'Bearer ' + auth;
    const r = await fetch(pedido.url, { method: pedido.metodo, credentials: 'include', headers: h, body: JSON.stringify(pedido.corpo) });
    return r.status;
  };
  try {
    let s = await tentar('');
    if (s === 401 || s === 403) {
      const j = await fetch('https://onvio.com.br/api/security/v1/jwt/sessions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (j.status === 200 || j.status === 201) { const t = (await j.json()).token; if (t) s = await tentar(t); }
    }
    return { status: s };
  } catch (e) { return { status: 0 }; }
}
/** Executor de escrita pela aba do Onvio. Recusa tudo que não for a escrita da lista fechada. */
export async function criarEscritor() {
  const tab = await abaOnvio();
  if (!tab) throw new AuthError('Não há aba do Onvio aberta. Abra https://onvio.com.br, faça login e tente de novo.');
  if (visaoCliente(tab)) throw new AuthError('A aba do Onvio está na visão do cliente. Use o acesso do escritório.');
  return async pedido => {
    if (!escritaPermitida(pedido) && !lixeiraPermitida(pedido)) return { status: 0 };
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', args: [pedido], func: escreverNaPagina });
    return (res && res.result) || { status: 0 };
  };
}
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
