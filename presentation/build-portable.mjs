import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const read = (path) => readFile(new URL(path, root));
let html = (await read('index.html')).toString();
let css = (await read('deck.css')).toString();
const js = (await read('deck.js')).toString();
const mime = { ttf: 'font/ttf', jpg: 'image/jpeg', svg: 'image/svg+xml' };
const toDataUrl = async (path) => `data:${mime[path.split('.').pop()]};base64,${(await read(path)).toString('base64')}`;

for (const match of [...css.matchAll(/url\('([^']+)'\)/g)]) {
  css = css.replaceAll(match[0], `url('${await toDataUrl(match[1])}')`);
}
html = html.replace('<link rel="stylesheet" href="deck.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script src="deck.js" defer></script>', '');
html = html.replace('</body>', `<script>\n${js}\n</script>\n</body>`);
html = html.replaceAll('src="assets/healthaccess-cover.jpg"', `src="${await toDataUrl('assets/healthaccess-cover.jpg')}"`);
html = html.replace('href="assets/favicon.svg"', `href="${await toDataUrl('assets/favicon.svg')}"`);
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Portable export. Edit index.html, deck.css and deck.js, then run node presentation/build-portable.mjs. -->');
await writeFile(new URL('HealthAccess.html', root), html);
console.log('Created presentation/HealthAccess.html — all fonts, visuals and controls embedded.');
