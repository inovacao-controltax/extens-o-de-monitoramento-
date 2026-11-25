// Leitor do Gestta chamado pelo hub: executa a leitura dentro da aba do Gestta (token só lá) e devolve só o corpo da resposta.
import { criarLeitor } from './gestta-reader.js';
import { buscarGestta } from './gestta-pagina.js';
import { AuthError } from './onvio-reader.js';

export async function abaGestta() {
  const abas = await chrome.tabs.query({ url: 'https://app.gestta.com.br/*' });
  const pronta = t => !t.discarded && t.status === 'complete' && !/\/login/i.test(t.url || '');
  return abas.find(t => t.active && pronta(t)) || abas.find(pronta) || null;
}
export async function criarLeitorGestta({ onChamada } = {}) {
  const tab = await abaGestta();
  if (!tab) throw new AuthError('Não há aba do Gestta aberta e logada. Abra https://app.gestta.com.br, faça login e tente de novo.');
  const por = mundo => async (m, u, c) => {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: mundo, func: buscarGestta, args: [m, u, c ?? null] });
    return (res && res.result) || { status: 0, ct: '', body: 'sem resposta da aba' };
  };
  const principal = por('MAIN'), reserva = por('ISOLATED');
  return criarLeitor(async (m, u, c) => { const v = await principal(m, u, c); return v.status === 0 ? reserva(m, u, c) : v; }, { onChamada });
}
