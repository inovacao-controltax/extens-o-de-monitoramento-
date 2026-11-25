// Gera icons/16,32,48,128.png a partir de hub/logo.svg (fundo transparente). Uso: node scripts/gerar-icones.cjs
// Precisa do Playwright (só para gerar; os PNG já estão no repositório).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../hub/logo.svg'), 'utf8');
  const b = await chromium.launch();
  for (const n of [16, 32, 48, 128]) {
    const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    const pad = Math.max(1, Math.round(n * 0.06));
    await p.setContent(`<body style="margin:0;background:transparent;display:grid;place-items:center;width:${n}px;height:${n}px">${svg.replace('<svg ', `<svg style="height:${n - 2 * pad}px;width:auto" `)}</body>`);
    await p.screenshot({ path: path.join(__dirname, `../icons/${n}.png`), omitBackground: true });
    await p.close();
  }
  await b.close();
})();
