import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, output, root } from './build.mjs';
import { check } from './check.mjs';

await build();
await check();

// A fixed timestamp and sorted entries keep release assets identical on reruns.
const tar = execFileSync('tar', [
  '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
  '--format=ustar', '-cf', '-', '-C', output, '.',
], { maxBuffer: 32 * 1024 * 1024 });
const archive = gzipSync(tar, { level: 9 });
const filename = 'digital-field-station.tar.gz';
const artifacts = join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, filename), archive);
await writeFile(join(artifacts, 'SHA256SUMS'), `${createHash('sha256').update(archive).digest('hex')}  ${filename}\n`);
console.log(`Packaged artifacts/${filename} and artifacts/SHA256SUMS`);
