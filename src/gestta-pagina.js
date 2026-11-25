// Roda DENTRO da página do Gestta (content script ou executeScript): é o único lugar que enxerga o token.
// Função autossuficiente (é serializada pelo executeScript). Devolve só { status, ct, body }; o token nunca sai daqui.
export async function buscarGestta(metodo, url, corpo) {
  try {
    if (typeof url !== 'string' || !url.startsWith('https://api.gestta.com.br/')) return { status: 0, ct: '', body: 'endereço fora do Gestta' };
    let tok = null;
    try { tok = JSON.parse(localStorage.getItem('ngStorage-jwt') || 'null'); } catch (e) { tok = null; }
    if (typeof tok !== 'string' || !/^JWT\s+\S+/.test(tok)) return { status: 401, ct: '', body: '', semSessao: true };
    const headers = { Accept: 'application/json, text/plain, */*', Authorization: tok };
    let body;
    if (String(metodo).toUpperCase() === 'POST') { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corpo); }
    const r = await fetch(url, { method: String(metodo).toUpperCase(), headers, body, credentials: 'omit' });
    return { status: r.status, ct: r.headers.get('content-type'), body: await r.text() };
  } catch (e) { return { status: 0, ct: '', body: String(e) }; }
}
