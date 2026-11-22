#!/usr/bin/env node
// Bundles index.html, the stylesheet and every script into one HTML file.
//   node tools/bundle.js                 -> dist/pixel-realms.html (a full page)
//   node tools/bundle.js --fragment out  -> page content without <html>/<head>/<body>
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outArg = args.filter(a => !a.startsWith('--'))[0];
const out = path.resolve(outArg || path.join(root, 'dist', 'pixel-realms.html'));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = scripts.map(src => `// ---- ${src}\n` + fs.readFileSync(path.join(root, src), 'utf8')).join('\n');
if (js.includes('</script')) throw new Error('A script contains "</script", which would break inlining.');

const body = html.slice(html.indexOf('<!--BODY-START-->') + 17, html.indexOf('<!--BODY-END-->')).trim();
const title = (html.match(/<title>[^<]*<\/title>/) || ['<title>Pixel Realms</title>'])[0];
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map(m => m[0]).join('\n');

let page;
if (fragment) {
  page = `${title}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
} else {
  const head = html.slice(0, html.indexOf('<link rel="stylesheet" href="css/style.css">'));
  page = `${head}<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n<script>\n${js}\n</script>\n</body>\n</html>\n`;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(page.length / 1024).toFixed(0)} KB, ${scripts.length} scripts)`);
