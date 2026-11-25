// MODO APRENDER do Onvio (mundo da página). Só enquanto a pessoa ligou (até 2 h): registra quais chamadas a própria tela do Onvio faz,
// SÓ método, rota sem ids, nomes dos parâmetros e NOMES dos campos da resposta e do corpo enviado. Nunca valores, cabeçalhos nem token.
// Pegada zero por padrão: os ganchos só são instalados quando o modo é ligado (não mexe em fetch/XHR antes disso).
(() => {
  if (window.__ctmOnvioAprender) return; window.__ctmOnvioAprender = true;
  const ligado = () => document.documentElement.getAttribute('data-ctm-aprender') === '1';
  const rota = u => u.pathname.replace(/^\/api\//, '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}').replace(/[0-9a-f]{24}/gi, '{id}').replace(/\d{4,}/g, '{n}') + (u.search ? '?' + [...u.searchParams.keys()].join('&') : '');
  const nomes = d => {
    const out = [];
    const ver = (o, cam, prof) => {
      if (!o || typeof o !== 'object' || prof > 3 || out.length >= 70) return;
      if (Array.isArray(o)) { if (o.length) ver(o[0], cam + '[]', prof); return; }
      for (const [k, v] of Object.entries(o)) { const c = cam ? cam + '.' + k : k; out.push(c + ':' + (Array.isArray(v) ? 'lista' : v === null ? 'nulo' : typeof v)); if (v && typeof v === 'object') ver(v, c, prof + 1); }
    };
    ver(d, '', 0); return out;
  };
  const tentaNomes = t => { try { return t && t.length < 400000 ? nomes(JSON.parse(t)) : []; } catch (e) { return []; } };
  function registrar(metodo, url, status, resposta, corpo) {
    if (!ligado()) return;
    let u; try { u = new URL(url, location.href); } catch (e) { return; }
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return;
    document.dispatchEvent(new CustomEvent('ctm-onvio-chamada', { detail: JSON.stringify({ m: String(metodo || 'GET').toUpperCase(), r: rota(u), s: status, c: tentaNomes(resposta), b: tentaNomes(corpo) }) }));
  }
  let instalado = false;
  function instalar() {
    if (instalado) return; instalado = true;
    const f0 = window.fetch;
    window.fetch = function (...a) {
      const p = f0.apply(this, a);
      if (ligado()) { try { const req = a[0], url = typeof req === 'string' ? req : req && req.url, m = (a[1] && a[1].method) || (req && req.method) || 'GET', corpo = a[1] && typeof a[1].body === 'string' ? a[1].body : '';
        p.then(r => { r.clone().text().then(t => registrar(m, url, r.status, t, corpo)).catch(() => {}); }).catch(() => {}); } catch (e) { /* nada */ } }
      return p;
    };
    const o0 = XMLHttpRequest.prototype.open, s0 = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__ctmO = { m, u }; return o0.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (corpo) {
      if (ligado() && this.__ctmO) { const c = this.__ctmO; this.addEventListener('load', () => { try { registrar(c.m, c.u, this.status, this.responseType === '' || this.responseType === 'text' ? this.responseText : '', typeof corpo === 'string' ? corpo : ''); } catch (e) { /* nada */ } }); }
      return s0.apply(this, arguments);
    };
  }
  if (ligado()) instalar();
  new MutationObserver(() => { if (ligado()) instalar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ctm-aprender'] });
})();
