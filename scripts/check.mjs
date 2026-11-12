import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
for (const file of await readdir('.')) if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
const expected = ['LICENSE', 'README.md', 'README.en.md', 'client.js', 'cordis.patch.yml', 'download.js', 'index.js', 'locale/en.json', 'locale/zh.json', 'package.json'];
assert.deepEqual(packed.files.map(f => f.path).sort(), expected.sort());
console.log('Syntax and package allowlist OK:', expected.join(', '));
