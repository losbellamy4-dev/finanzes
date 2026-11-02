/**
 * Genera release/nexus-finance.html: la aplicación completa en un único
 * archivo HTML (JS, CSS e icono incrustados) que se abre con doble clic en
 * Chrome, sin servidor ni conexión.
 *
 * Uso: npm run build:html
 */
import { build } from 'vite';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'dist-single');
const releaseDir = path.join(root, 'release');
const target = path.join(releaseDir, 'nexus-finance.html');

process.env.NEXUS_SINGLE = '1';
await build({ configFile: path.join(root, 'vite.config.ts'), mode: 'production', logLevel: 'warn' });

let html = await readFile(path.join(outDir, 'index.html'), 'utf8');
const assets = await readdir(path.join(outDir, 'assets'));
const jsFiles = assets.filter((f) => f.endsWith('.js'));
const cssFiles = assets.filter((f) => f.endsWith('.css'));
if (jsFiles.length !== 1) throw new Error(`Se esperaba un único bundle JS y hay ${jsFiles.length}: ${jsFiles.join(', ')}`);

// Evita que el contenido incrustado cierre la etiqueta antes de tiempo.
const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');

const js = safeScript(await readFile(path.join(outDir, 'assets', jsFiles[0]), 'utf8'));
const css = safeStyle((await Promise.all(cssFiles.map((f) => readFile(path.join(outDir, 'assets', f), 'utf8')))).join('\n'));

// Se usan funciones de reemplazo para que los "$" del código no se interpreten.
html = html.replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/, () => '');
html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*"[^>]*>/g, () => '');
html = html.replace(/<link rel="modulepreload"[^>]*>/g, () => '');
html = html.replace(/<link rel="manifest"[^>]*>/, () => '');
const icon = await readFile(path.join(root, 'public', 'icon.svg'));
html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${icon.toString('base64')}" />`);
html = html.replace('</head>', () => `    <style>\n${css}\n    </style>\n  </head>`);
// El script de módulo en línea se ejecuta cuando el documento ya está analizado.
html = html.replace('</body>', () => `    <script type="module">\n${js}\n    </script>\n  </body>`);

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Quedan referencias a ficheros externos en el HTML.');

await mkdir(releaseDir, { recursive: true });
await writeFile(target, html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ ${path.relative(root, target)} (${kb} KB) — ábrelo con doble clic en Chrome.`);
