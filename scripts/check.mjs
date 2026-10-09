import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { output, pages, root } from './build.mjs';

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];

export async function check(directory = output) {
  const titles = new Set();
  for (const page of pages) {
    const html = await readFile(join(directory, page.file), 'utf8');
    assert.match(html, /^<!doctype html>/i, `${page.file}: missing doctype`);
    assert.match(html, /<html lang="en">/, `${page.file}: incorrect language`);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${page.file}: expected one h1`);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${page.file}: expected one main`);
    assert.doesNotMatch(html, /\{\{|\}\}|[\u0400-\u04ff]/, `${page.file}: unresolved token or non-English copy`);
    assert.doesNotMatch(html, /<script\b|\son[a-z]+\s*=|javascript:/i, `${page.file}: browser scripting is not allowed`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && !titles.has(title), `${page.file}: missing or duplicate title`);
    titles.add(title);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page.file}: duplicate element id`);
    const active = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
    assert.equal(active.length, 1, `${page.file}: expected one active navigation link`);
    assert.equal(attribute(active[0], 'href'), page.file, `${page.file}: wrong active navigation link`);

    for (const match of html.matchAll(/<(?:a|link|img)\b[^>]*>/g)) {
      const tag = match[0];
      const image = /^<img\b/.test(tag);
      const resource = image || /^<link\b/.test(tag);
      const reference = attribute(tag, image ? 'src' : 'href');
      assert.ok(reference, `${page.file}: missing resource or link target`);
      if (image) {
        assert.ok(attribute(tag, 'alt'), `${page.file}: missing image description`);
        assert.match(attribute(tag, 'width') ?? '', /^\d+$/);
        assert.match(attribute(tag, 'height') ?? '', /^\d+$/);
      }
      if (reference.startsWith('data:image/svg+xml,') && /^<link\b/.test(tag)) continue;
      assert.doesNotMatch(reference, /^(?:[a-z]+:|\/\/|\/)/i, `${page.file}: expected a relative local URL`);
      const [file, fragment] = reference.split('#');
      const target = resolve(directory, file || page.file);
      assert.ok(target.startsWith(resolve(directory) + sep), `${page.file}: target escapes document root`);
      assert.ok((await stat(target)).isFile(), `${page.file}: missing target ${reference}`);
      if (fragment) {
        const targetHtml = file ? await readFile(target, 'utf8') : html;
        assert.ok(targetHtml.includes(`id="${fragment}"`), `${page.file}: broken fragment ${reference}`);
      }
      if (resource) assert.ok(file.startsWith('assets/'), `${page.file}: resource outside assets/`);
    }
  }

  for (const name of await readdir(join(directory, 'assets'))) {
    const match = name.match(/^(.+)\.([a-f0-9]{12})\.(css|jpg|png|webp)$/);
    assert.ok(match, `Unexpected output resource: ${name}`);
    const bytes = await readFile(join(directory, 'assets', name));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), match[2], `Incorrect resource hash: ${name}`);
    if (match[3] === 'css') {
      assert.doesNotMatch(bytes.toString(), /@import\b|url\s*\(/i, 'Stylesheet must not load additional resources');
    }
  }

  const sources = JSON.parse(await readFile(join(root, 'src/assets/sources.json'), 'utf8'));
  for (const [name, source] of Object.entries(sources)) {
    assert.equal(source.license, 'CC0-1.0', `Unexpected image license: ${name}`);
    assert.ok(source.author && source.source && source.licenseUrl, `Missing image provenance: ${name}`);
    const bytes = await readFile(join(root, 'src/assets', name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, `Source image changed: ${name}`);
  }
  console.log(`Checked ${pages.length} pages, navigation, local resources and image provenance`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await check(process.argv[2] ? resolve(process.argv[2]) : output);
