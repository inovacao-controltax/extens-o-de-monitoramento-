// Fase 1: apenas abre o hub ao clicar no ícone da extensão.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('hub/hub.html');
  try {
    const [existing] = await chrome.tabs.query({ url });
    if (existing) await chrome.tabs.update(existing.id, { active: true });
    else await chrome.tabs.create({ url });
  } catch (e) { console.error('abrir hub', e); }
});
