import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const shell = await readFile('dist/index.html');
const worker = await readFile('public/sw.js', 'utf8');
const version = createHash('sha256').update(shell).update(worker).digest('hex').slice(0, 16);
await writeFile('dist/sw.js', worker.replace('__BUILD_ID__', version));
