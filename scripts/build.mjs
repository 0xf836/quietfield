import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = join(root, 'dist');
export const pages = [
  { file: 'index.html', label: 'Overview', title: 'Digital Field Station', description: 'A shared field practice connecting weather records, wildlife observations and seasonal change.' },
  { file: 'observations.html', label: 'Observations', title: 'Observations — Digital Field Station', description: 'Weather, wildlife and remote observations, considered together over time.' },
  { file: 'field-practice.html', label: 'Field practice', title: 'Field practice — Digital Field Station', description: 'Keeping field observations useful through context, careful records and periodic review.' },
];

export async function build() {
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'assets'), { recursive: true });
  const assets = new Map();
  const assetFiles = ['styles.css', ...(await readdir(join(root, 'src/assets'))).filter(name => /\.(jpg|png|webp)$/.test(name)).sort().map(name => `assets/${name}`)];
  for (const file of assetFiles) {
    const bytes = await readFile(join(root, 'src', file));
    const name = file.split('/').at(-1);
    const extension = name.slice(name.lastIndexOf('.'));
    const stem = name.slice(0, -extension.length);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const target = `assets/${stem}.${hash}${extension}`;
    await writeFile(join(output, target), bytes);
    assets.set(name, target);
  }
  const layout = await readFile(join(root, 'src/layout.html'), 'utf8');
  for (const page of pages) {
    const content = await readFile(join(root, 'src/pages', page.file), 'utf8');
    const navigation = pages.map(item => `<a href="${item.file}"${item.file === page.file ? ' aria-current="page"' : ''}>${item.label}</a>`).join('\n        ');
    let html = layout.replaceAll('{{content}}', content);
    for (const [key, value] of Object.entries({ ...page, navigation })) html = html.replaceAll(`{{${key}}}`, value);
    html = html.replace(/\{\{asset:([^}]+)\}\}/g, (_, name) => {
      if (!assets.has(name)) throw new Error(`Unknown asset: ${name}`);
      return assets.get(name);
    });
    if (/\{\{|\}\}/.test(html)) throw new Error(`Unresolved template token in ${page.file}`);
    await writeFile(join(output, page.file), html);
  }
  console.log(`Built ${pages.length} pages in dist/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await build();
