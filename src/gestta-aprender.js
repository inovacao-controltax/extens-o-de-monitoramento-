// MODO APRENDER do Gestta (mundo da página). Só enquanto a pessoa ligou (até 2 h): registra quais chamadas a própria tela do Gestta faz
// à API, SÓ o método, a rota sem ids, os nomes dos parâmetros e os NOMES dos campos da resposta e do corpo enviado. Nunca valores,
// nunca cabeçalhos nem token. Serve para descobrir onde fica uma configuração (ex.: notificação de tarefa de um funcionário).
(() => {
  if (window.__ctmAprender) return; window.__ctmAprender = true;
  const ativo = () => document.documentElement.getAttribute('data-ctm-aprender') === '1';
  const rota = u => u.pathname.replace(/[0-9a-f]{24}/gi, '{id}').replace(/\d{5,}/g, '{n}') + (u.search ? '?' + [...u.searchParams.keys()].join('&') : '');
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
    if (!ativo()) return;
    let u; try { u = new URL(url, location.href); } catch (e) { return; }
    if (u.origin !== 'https://api.gestta.com.br') return;
    document.dispatchEvent(new CustomEvent('ctm-gestta-chamada', { detail: JSON.stringify({ m: String(metodo || 'GET').toUpperCase(), r: rota(u), s: status, c: tentaNomes(resposta), b: tentaNomes(corpo) }) }));
  }
  const f0 = window.fetch;
  window.fetch = function (...a) {
    const p = f0.apply(this, a);
    if (ativo()) { try { const req = a[0], url = typeof req === 'string' ? req : req && req.url, m = (a[1] && a[1].method) || (req && req.method) || 'GET', corpo = a[1] && typeof a[1].body === 'string' ? a[1].body : '';
      p.then(r => { r.clone().text().then(t => registrar(m, url, r.status, t, corpo)).catch(() => {}); }).catch(() => {}); } catch (e) { /* nada */ } }
    return p;
  };
  const o0 = XMLHttpRequest.prototype.open, s0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ctm = { m, u }; return o0.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (corpo) {
    if (ativo() && this.__ctm) { const c = this.__ctm; this.addEventListener('load', () => { try { registrar(c.m, c.u, this.status, this.responseType === '' || this.responseType === 'text' ? this.responseText : '', typeof corpo === 'string' ? corpo : ''); } catch (e) { /* nada */ } }); }
    return s0.apply(this, arguments);
  };
})();
