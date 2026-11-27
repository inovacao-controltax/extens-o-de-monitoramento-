// Copiar texto para a área de transferência. Dentro do quadro por cima do Onvio o Chrome costuma recusar navigator.clipboard
// (o quadro não tinha a permissão "clipboard-write"); aí cai para o jeito antigo (textarea + execCommand), que funciona no clique da pessoa.
export async function copiarTexto(texto) {
  const t = String(texto ?? '');
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* tenta o outro jeito */ }
  const ta = document.createElement('textarea');
  ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}
