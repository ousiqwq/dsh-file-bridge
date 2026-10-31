import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDownloads, byteRange, contentDisposition, filenameOf, PREPARE, DOWNLOAD } from '../download.js';
import { apply } from '../index.js';

const base = 'http://localhost:3080';
const post = data => new Request(base + PREPARE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
function setup(t, options = {}) {
  let time = 1000, exists = true, version = 'v1', denied = false;
  const bytes = options.bytes ?? Buffer.from('中文\0binary\xff\x00\x01', 'utf8');
  const path = '/workspace/中文 文件.xpi', reads = [], scopes = [];
  const info = () => ({ absolutePath: path, version, bytes: bytes.length });
  const deps = {
    now: () => time,
    scopeFor: async id => { scopes.push(id); return exists && id === 's1' ? { sessionId: id, workspaceRoot: '/workspace' } : undefined; },
    stat: async (_scope, input) => {
      if (input !== path) throw Object.assign(new Error('private path must not leak'), { code: 'workspace-file/not-found' });
      if (denied) throw Object.assign(new Error('sensitive denial'), { code: 'EACCES' });
      return info();
    },
    readBytes: async (_scope, input, { range }, signal) => {
      signal.throwIfAborted();
      assert.equal(input, path); assert.ok(range.length <= 65536);
      if (denied) throw Object.assign(new Error('private denial'), { code: 'EACCES' });
      reads.push(range);
      return { ...info(), offset: range.offset, data: bytes.subarray(range.offset, range.offset + range.length) };
    },
    ...options.deps,
  };
  const service = createDownloads({ ...deps, ...options.config });
  t.after(() => service.dispose());
  return { service, bytes, path, reads, scopes, info, deps,
    advance: n => { time += n; }, change: () => { version = 'v2'; }, remove: () => { exists = false; }, deny: () => { denied = true; },
    async prepare(data = { sessionId: 's1', path }) {
      const response = await service.prepare(post(data)); assert.equal(response.status, 200); return response.json();
    },
    get: (ticket, init) => service.download(new Request(base + ticket.url, init)),
  };
}

test('binary bytes and Chinese filename are preserved; no inline rendering', async t => {
  const f = setup(t), ticket = await f.prepare();
  assert.equal(ticket.filename, '中文 文件.xpi');
  const response = await f.get(ticket);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /^attachment;.*filename\*=UTF-8''/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bytes);
});

test('large files exceed native full-preview cap using bounded reads', async t => {
  const bytes = Buffer.alloc(33 * 1024 * 1024 + 17);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const f = setup(t, { bytes }), response = await f.get(await f.prepare());
  const hash = createHash('sha256'); let length = 0;
  for await (const chunk of response.body) { hash.update(chunk); length += chunk.length; }
  assert.equal(length, bytes.length);
  assert.equal(hash.digest('hex'), createHash('sha256').update(bytes).digest('hex'));
  assert.ok(f.reads.length > 500); assert.ok(f.reads.every(r => r.length <= 65536));
});

test('HEAD and Range support partial/resumable binary downloads', async t => {
  const f = setup(t), ticket = await f.prepare(), head = await f.get(ticket, { method: 'HEAD' });
  assert.equal(head.body, null); assert.equal(head.headers.get('content-length'), String(f.bytes.length));
  const response = await f.get(ticket, { headers: { range: 'bytes=1-4', 'if-range': head.headers.get('etag') } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes 1-4/${f.bytes.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bytes.subarray(1, 5));
  const suffix = await f.get(ticket, { headers: { range: 'bytes=-3' } });
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), f.bytes.subarray(-3));
  const mismatch = await f.get(ticket, { headers: { range: 'bytes=1-4', 'if-range': '"old"' } });
  assert.equal(mismatch.status, 200); await mismatch.body.cancel();
});

test('invalid ranges fail with 416 and correct size, never a partial success', async t => {
  const f = setup(t), ticket = await f.prepare();
  for (const range of ['bytes=999-', 'bytes=-0', 'bytes=4-2', 'bytes=0-1,4-5', 'bytes=-', 'bytes=a-z', 'bytes=9007199254740992-']) {
    const response = await f.get(ticket, { headers: { range } });
    assert.equal(response.status, 416, range); assert.equal(response.headers.get('content-range'), `bytes */${f.bytes.length}`);
  }
});

test('empty file is downloadable; empty range is unsatisfiable', async t => {
  const f = setup(t, { bytes: Buffer.alloc(0) }), ticket = await f.prepare();
  const response = await f.get(ticket); assert.equal(response.status, 200); assert.equal(await response.text(), '');
  assert.equal((await f.get(ticket, { headers: { range: 'bytes=0-' } })).status, 416);
});

test('tickets expire and forged ids cannot read files', async t => {
  const f = setup(t), ticket = await f.prepare(); f.advance(300001);
  assert.equal((await f.get(ticket)).status, 410);
  assert.equal((await f.service.download(new Request(base + DOWNLOAD + '?ticket=../secret'))).status, 410);
  assert.equal((await f.service.download(new Request(base + DOWNLOAD))).status, 410);
});

test('deleted session or revoked access is checked again at download time', async t => {
  const a = setup(t), ticketA = await a.prepare(); a.remove();
  assert.equal((await a.get(ticketA)).status, 404);
  const b = setup(t), ticketB = await b.prepare(); b.deny();
  const denied = await b.get(ticketB); assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { error: 'forbidden' });
});

test('file changes between preparing and downloading are rejected', async t => {
  const f = setup(t), ticket = await f.prepare(); f.change();
  const response = await f.get(ticket); assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'changed' });
});

test('file changing during transfer fails instead of returning mixed bytes', async t => {
  const f = setup(t, { bytes: Buffer.alloc(150000) }), ticket = await f.prepare(), response = await f.get(ticket);
  const reader = response.body.getReader(); assert.equal((await reader.read()).value.byteLength, 65536); f.change();
  await assert.rejects(reader.read(), /changed/);
});

test('cancelling a browser download stops further reads', async t => {
  const f = setup(t, { bytes: Buffer.alloc(150000) }), response = await f.get(await f.prepare());
  const reader = response.body.getReader(); await reader.read(); const before = f.reads.length;
  await reader.cancel(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.reads.length, before);
});

test('unloading plugin invalidates pending tickets and aborts current streams', async t => {
  const f = setup(t, { bytes: Buffer.alloc(150000) }), ticket = await f.prepare(), response = await f.get(ticket);
  f.service.dispose(); assert.equal((await f.get(ticket)).status, 410);
  await assert.rejects(response.arrayBuffer());
});

test('bounded preparations recover after expired entries are swept', async t => {
  const f = setup(t, { config: { maxTickets: 1 } }); await f.prepare();
  assert.equal((await f.service.prepare(post({ sessionId: 's1', path: f.path }))).status, 429);
  f.advance(300001); await f.prepare();
});

test('invalid requests are rejected before any reads, errors hide private messages', async t => {
  const f = setup(t);
  for (const data of [null, [], {}, { sessionId: 3, path: f.path }, { sessionId: 's1', path: 'a\0b' }, { sessionId: 's1', path: 'x'.repeat(8193) }]) {
    assert.equal((await f.service.prepare(post(data))).status, 400);
  }
  assert.equal(f.reads.length, 0);
  assert.equal((await f.service.prepare(post({ sessionId: 's1', path: '../outside' }))).status, 404);
  const denied = await f.service.prepare(post({ sessionId: 's1', path: '/private/missing' }));
  assert.deepEqual(await denied.json(), { error: 'missing' });
  assert.equal((await f.service.prepare(post({ sessionId: 'missing', path: f.path }))).status, 404);
});

test('wrong method, MIME, malformed and excessive JSON body fail', async t => {
  const f = setup(t);
  assert.equal((await f.service.prepare(new Request(base + PREPARE))).status, 405);
  assert.equal((await f.service.prepare(new Request(base + PREPARE, { method: 'POST', body: '{}' }))).status, 415);
  for (const [body, status] of [['{', 400], [' '.repeat(17000), 413]]) {
    assert.equal((await f.service.prepare(new Request(base + PREPARE, { method: 'POST', headers: { 'content-type': 'application/json' }, body }))).status, status);
  }
});

test('unsafe header characters and Unicode are encoded, not executed', () => {
  assert.equal(filenameOf('C:\\files\\中文.xlsx'), '中文.xlsx');
  const header = contentDisposition(filenameOf('/work/x\r\n"%\u202e.html'));
  assert.ok(!/[\r\n]/.test(header)); assert.match(header, /^attachment;/); assert.match(header, /filename\*=UTF-8''/);
  assert.deepEqual(byteRange('bytes=2-999', 5), { start: 2, end: 4, partial: true });
});

test('adapter registers only native authenticated routes and preserves scope resolution', async () => {
  const routes = [], effects = [], observed = [];
  const ctx = {
    connection: { fetch: { register: route => routes.push(route) } },
    sessions: { get: id => id === 'live' ? { header: { cwd: '/actual' } } : undefined },
    get: () => ({ stat: async id => id === 'stored' ? { header: {} } : undefined }),
    sandboxPolicy: { workspaceRoot: '/fallback' },
    workspaceFiles: { stat: async (scope, path) => { observed.push(scope); return { absolutePath: path, version: '1', bytes: 0 }; } },
    effect: factory => { effects.push(factory()); },
  };
  apply(ctx);
  try {
    assert.deepEqual(routes.map(r => [r.path, r.methods]), [[PREPARE, ['POST']], [DOWNLOAD, ['GET', 'HEAD']]]);
    for (const sessionId of ['live', 'stored']) assert.equal((await routes[0].fetch(post({ sessionId, path: '/file' }))).status, 200);
    assert.deepEqual(observed, [{ sessionId: 'live', workspaceRoot: '/actual' }, { sessionId: 'stored', workspaceRoot: '/fallback' }]);
  } finally { for (const dispose of effects) dispose(); }
});
