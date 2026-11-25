import { DEFAULT_CONFIG, SETORES, loadConfig, saveConfig, validateConfig, testFileName, parseTrained, mergeTrained, formatCnpj } from '../src/config.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';
const secClass = s => ({ 'Pessoal': 'sec-pessoal', 'Contábil': 'sec-contabil', 'Fiscal': 'sec-fiscal', 'Financeiro': 'sec-financeiro' }[s] || 'sec-outro');

// Modal de confirmação (nada de confirm() nativo, ver DESIGN.md)
export function confirmModal({ title, text, ok = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    const ov = document.getElementById('overlay');
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn" data-r="0" type="button">Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1" type="button">${esc(ok)}</button></div></div>`;
    ov.classList.add('open');
    const prev = document.activeElement;
    const done = v => { ov.classList.remove('open'); document.removeEventListener('keydown', key); prev?.focus?.(); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', key);
    ov.onclick = e => { if (e.target === ov) done(false); };
    ov.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => done(b.dataset.r === '1')));
    ov.querySelector('[data-r="1"]').focus();
  });
}

export async function renderConfig(root, { toast, onSaved }) {
  const saved = await loadConfig();
  let draft = structuredClone(saved);
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  const $ = s => root.querySelector(s);

  root.innerHTML = `
  <div class="toolbar"><span class="grow" id="dirty"></span>
    <button class="btn" id="restore" type="button">Restaurar padrão</button>
    <button class="btn btn-primary" id="save" type="button">Salvar configurações</button></div>
  <div class="cfg-grid">
    <section class="card"><h2>Padrão de nome de arquivo</h2>
      <div class="field" id="f-pattern"><label for="pattern">Expressão do padrão (regex)</label>
        <input id="pattern" class="num" spellcheck="false" autocomplete="off"><span class="hint" id="h-pattern">Exemplo de padrão: AAAA-MM - TIPO - Descrição.pdf. Troque pelo padrão oficial da ControlTax.</span></div>
      <div class="field" id="f-test"><label for="testname">Testar um nome de arquivo</label>
        <div class="row"><input id="testname" placeholder="2026-11 - NFE - entradas.pdf" autocomplete="off"><span id="testres"></span></div></div></section>
    <section class="card"><h2>Pastas permitidas</h2>
      <p class="note-txt">Pastas de primeiro nível aceitas em cada empresa no portal de documentos.</p>
      <div class="chips" id="chips"></div>
      <div class="field" id="f-folders"><label for="newfolder">Adicionar pasta</label>
        <div class="row"><input id="newfolder" placeholder="Ex.: Societário" autocomplete="off"><button class="btn" id="addfolder" type="button">Adicionar pasta</button></div>
        <span class="hint" id="h-folders"></span></div></section>
    <section class="card"><h2>Clientes sem envio</h2>
      <div class="field" id="f-dias"><label for="dias">Alertar após quantos dias sem envio</label>
        <input id="dias" class="num" type="number" min="1" max="365" inputmode="numeric"><span class="hint" id="h-dias">Vale para clientes já treinados e com demanda.</span></div></section>
    <section class="card wide"><h2>Clientes treinados <span class="count" id="tcount"></span></h2>
      <div class="field"><label for="paste">Colar da planilha</label>
        <textarea id="paste" rows="4" class="num" placeholder="Empresa;CNPJ;Treinado em;Demanda&#10;Alfa Ltda;11.222.333/0001-81;01/09/2026;Pessoal, Fiscal"></textarea>
        <span class="hint">Colunas: empresa, CNPJ, treinado em (dd/mm/aaaa) e demanda (Pessoal, Fiscal, Contábil, Financeiro). Separe por ponto e vírgula ou cole direto do Excel.</span></div>
      <div class="row"><button class="btn" id="import" type="button">Importar lista</button><button class="btn btn-ghost" id="clearT" type="button">Remover todos</button></div>
      <ul class="errs" id="errs"></ul><div id="ttable"></div></section>
  </div>`;

  const setErr = (id, msg) => { const f = $('#f-' + id); f.classList.toggle('has-error', !!msg); if (msg) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); f.addEventListener('animationend', () => f.classList.remove('shake'), { once: true }); } const h = $('#h-' + id); if (h && msg) h.textContent = msg; };
  const refreshDirty = () => { $('#dirty').textContent = dirty() ? 'Alterações não salvas' : 'Tudo salvo'; $('#save').disabled = !dirty(); };

  function test() {
    const r = testFileName(draft.filePattern, $('#testname').value);
    $('#testres').innerHTML = r === null ? '' : r ? '<span class="badge s-ok">Dentro do padrão</span>' : '<span class="badge s-late">Fora do padrão</span>';
  }
  function chips() {
    $('#chips').innerHTML = draft.allowedFolders.map((f, i) => `<span class="chip-x">${esc(f)}<button type="button" data-rm="${i}" aria-label="Remover pasta ${esc(f)}">×</button></span>`).join('') || '<span class="muted">Nenhuma pasta.</span>';
    $('#chips').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.allowedFolders.splice(+b.dataset.rm, 1); chips(); refreshDirty(); }));
  }
  function trained() {
    const t = draft.trained; $('#tcount').textContent = t.length;
    $('#clearT').hidden = !t.length;
    $('#ttable').innerHTML = !t.length
      ? '<div class="empty"><b>Nenhum cliente treinado ainda.</b><p>Cole a lista da planilha de treinamento acima e clique em Importar lista.</p></div>'
      : `<div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th>CNPJ</th><th class="col-sec">Treinado em</th><th>Demanda</th><th></th></tr></thead><tbody>${t.map((x, i) =>
        `<tr><td><span class="emp">${esc(x.empresa)}</span></td><td class="num">${esc(formatCnpj(x.cnpj))}</td><td class="num col-sec">${fmtDate(x.treinadoEm)}</td><td>${x.demanda.map(s => `<span class="sector ${secClass(s)}">${esc(s)}</span>`).join('') || '<span class="muted">—</span>'}</td><td class="r"><button class="btn btn-ghost btn-sm" data-del="${i}" type="button">Remover</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#ttable').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { draft.trained.splice(+b.dataset.del, 1); trained(); refreshDirty(); }));
  }
  function fill() { $('#pattern').value = draft.filePattern; $('#dias').value = draft.diasSemEnvio; chips(); trained(); test(); refreshDirty(); }

  $('#pattern').addEventListener('input', e => { draft.filePattern = e.target.value; setErr('pattern', null); $('#f-pattern').classList.remove('has-error'); $('#h-pattern').textContent = 'Exemplo de padrão: AAAA-MM - TIPO - Descrição.pdf. Troque pelo padrão oficial da ControlTax.'; test(); refreshDirty(); });
  $('#testname').addEventListener('input', test);
  $('#dias').addEventListener('input', e => { draft.diasSemEnvio = e.target.value === '' ? NaN : Number(e.target.value); $('#f-dias').classList.remove('has-error'); $('#h-dias').textContent = 'Vale para clientes já treinados e com demanda.'; refreshDirty(); });
  const addFolder = () => {
    const v = $('#newfolder').value.trim(); if (!v) return;
    if (draft.allowedFolders.some(f => f.toLowerCase() === v.toLowerCase())) return setErr('folders', `A pasta "${v}" já está na lista.`);
    draft.allowedFolders.push(v); $('#newfolder').value = ''; $('#f-folders').classList.remove('has-error'); $('#h-folders').textContent = ''; chips(); refreshDirty();
  };
  $('#addfolder').addEventListener('click', addFolder);
  $('#newfolder').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFolder(); } });
  $('#import').addEventListener('click', () => {
    const { rows, errors } = parseTrained($('#paste').value);
    $('#errs').innerHTML = errors.map(e => `<li>Linha ${e.linha}: ${esc(e.msg)}</li>`).join('');
    if (rows.length) { draft.trained = mergeTrained(draft.trained, rows); trained(); refreshDirty(); }
    if (!rows.length && !errors.length) return toast('Cole ao menos uma linha antes de importar', 'warn');
    if (!errors.length) $('#paste').value = '';
    toast(`${rows.length} cliente(s) importado(s)${errors.length ? `, ${errors.length} linha(s) com erro` : ''}`, errors.length ? 'warn' : 'ok');
  });
  $('#clearT').addEventListener('click', async () => {
    if (await confirmModal({ title: 'Remover todos os clientes treinados?', text: `${draft.trained.length} cliente(s) saem da lista. A mudança só vale depois de clicar em Salvar configurações.`, ok: 'Remover todos', danger: true })) { draft.trained = []; trained(); refreshDirty(); }
  });
  $('#restore').addEventListener('click', async () => {
    if (await confirmModal({ title: 'Restaurar o padrão?', text: 'Padrão de nome, pastas e dias voltam ao exemplo inicial. A lista de clientes treinados é mantida.', ok: 'Restaurar padrão' })) {
      draft = { ...structuredClone(DEFAULT_CONFIG), trained: draft.trained }; fill(); toast('Padrão restaurado, falta salvar');
    }
  });
  $('#save').addEventListener('click', async () => {
    const errs = validateConfig(draft);
    setErr('pattern', errs.filePattern); setErr('folders', errs.allowedFolders); setErr('dias', errs.diasSemEnvio);
    if (Object.keys(errs).length) return toast('Corrija os campos em vermelho para salvar', 'warn');
    const res = await saveConfig(draft);
    if (!res.ok) return toast(res.errors._geral || 'Não foi possível salvar', 'warn');
    Object.assign(saved, structuredClone(draft)); refreshDirty(); toast('Configurações salvas'); onSaved?.(draft);
  });
  fill();
}
