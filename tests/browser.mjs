// Live acceptance against an explicitly selected Harness instance.
// PLAYWRIGHT_MODULE: optional installed Playwright module path.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE: optional existing browser executable.
// DSH_TEST_URL: required; DSH_TEST_SESSION: optional disposable session.
// Creates synthetic fixtures locally and a blank test session if none supplied.
// Sends no model prompts. Archives only its own new test session on completion.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.DSH_TEST_URL;
assert.ok(root, 'Set DSH_TEST_URL explicitly');
const output = resolve('test-results'), fixtureDir = join(output, 'fixtures');
await mkdir(fixtureDir, { recursive: true });
const fixtures = {
  '中文 下载.xpi': Buffer.from('PK\x03\x04\0\xffFile Bridge binary download test\r\n'),
  '表格.csv': Buffer.from('item,value\nalpha,12\nbeta,34\n'),
  '说明.md': Buffer.from('# File Bridge preview\n\nNative Markdown stays available.\n'),
  'empty.zip': Buffer.alloc(0),
  'large.bin': Buffer.alloc(33 * 1024 * 1024 + 7, 0xa7),
};
for (const [name, data] of Object.entries(fixtures)) await writeFile(join(fixtureDir, name), data);
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 950 }, colorScheme: 'dark', locale: 'zh-CN' });
const errors = [], report = { files: [], widths: [] };
page.on('pageerror', error => errors.push(error.message));
// Instrument only the synthetic browser's fetched plugin source to expose its
// Context to this test. No production files or browser sessions are modified.
await page.route('**/plugins/**', async route => {
  if (!route.request().url().includes('dsh-plugin-file-bridge')) return route.continue();
  const response = await route.fetch();
  const body = (await response.text()).replace(
    "apply(ctx) {\n        ctx.effect(() => { const style",
    "apply(ctx) {\n        window.__FILE_BRIDGE_TEST_CTX__ = ctx;\n        ctx.effect(() => { const style");
  await route.fulfill({ response, body });
});
let sessionId = process.env.DSH_TEST_SESSION, created = false;
async function rpc(method, args) {
  const response = await page.request.post(root + '/api/' + method, { headers: { origin: root },
    data: { type: 'client-request', rpcId: randomUUID(), method, payload: { args } } });
  const body = await response.json(); assert.equal(body.result?.ok, true, JSON.stringify(body.result)); return body.result.value;
}
async function open(name) {
  const path = join(fixtureDir, name);
  await page.evaluate(({ sessionId, path }) => {
    const ctx = window.__FILE_BRIDGE_TEST_CTX__;
    const address = 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + path.split('/').map(encodeURIComponent).join('/');
    ctx.get('sidebarRight').openResource(address);
  }, { sessionId, path });
  await page.locator('.dfb-button:visible').first().waitFor({ timeout: 20000 });
  // Active tabs render their absolute path in the header; wait for the new file.
  await page.getByText(path, { exact: true }).first().waitFor();
}
try {
  await page.goto(root);
  await page.waitForFunction(() => window.__FILE_BRIDGE_TEST_CTX__, { timeout: 30000 });
  if (!sessionId) {
    sessionId = (await rpc('session/create', { request: { cwd: fixtureDir, sessionId: 'session-' + randomUUID() } })).sessionId;
    created = true;
    await writeFile(join(output, 'test-session.json'), JSON.stringify({ sessionId, fixtureDir }));
  }
  await page.evaluate(sessionId => window.__FILE_BRIDGE_TEST_CTX__.get('uiWorkspace').openSession(sessionId), sessionId);
  await page.waitForFunction(sessionId => {
    const sessions = window.__FILE_BRIDGE_TEST_CTX__.get('sessions').list.getSnapshot();
    return (sessions.byId[sessionId]?.retainedBy.mainView ?? 0) > 0;
  }, sessionId);
  for (const [name, expected] of Object.entries(fixtures)) {
    console.log('Checking file:', name);
    await open(name);
    const visible = page.locator('.dfb-action:visible');
    if (name.endsWith('.csv')) {
      await page.locator('canvas').first().waitFor();
      await page.screenshot({ path: join(output, 'native-spreadsheet.png') });
    }
    if (name.endsWith('.md')) await page.getByRole('heading', { name: 'File Bridge preview' }).waitFor();
    if (name.endsWith('.xpi')) await page.locator('.dfb-action[data-expanded]:visible').waitFor();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), visible.first().getByRole('button').click()]);
    assert.equal(download.suggestedFilename(), name);
    assert.equal(await download.failure(), null);
    const received = await readFile(await download.path());
    assert.equal(createHash('sha256').update(received).digest('hex'), createHash('sha256').update(expected).digest('hex'));
    report.files.push({ name, bytes: received.length, verified: true });
  }
  await open('中文 下载.xpi');
  for (const width of [1440, 1000, 775, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const button = page.locator('.dfb-action[data-expanded]:visible .dfb-button');
    await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
    assert.ok(box.width >= 28 && box.height >= 28);
    assert.ok(box.x >= -1 && box.x + box.width <= width + 1, JSON.stringify({ width, box }));
    report.widths.push(width);
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({ path: join(output, 'browser.png') });
  // Errors must be visible and retry must work without reloading the page.
  await page.route('**/api/file-bridge.prepare', route => route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"changed"}' }));
  await page.locator('.dfb-action[data-expanded]:visible .dfb-button').click();
  await page.getByRole('alert').filter({ hasText: '文件已变更' }).waitFor();
  await page.unroute('**/api/file-bridge.prepare');
  const [retried] = await Promise.all([page.waitForEvent('download'), page.locator('.dfb-action[data-expanded]:visible .dfb-button').click()]);
  assert.equal(await retried.failure(), null);
  const forbidden = await page.request.post(root + '/api/file-bridge.prepare', { headers: { origin: 'https://untrusted.invalid' }, data: { sessionId, path: join(fixtureDir, '说明.md') } });
  assert.equal(forbidden.status(), 403);
  report.originFence = true; report.retry = true; report.pageErrors = errors;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.screenshot({ path: join(output, 'last-browser-state.png') }).catch(() => {});
  if (created && sessionId) {
    try { await page.evaluate(id => window.__FILE_BRIDGE_TEST_CTX__.get('uiWorkspace').archiveSession(id), sessionId); report.testSessionArchived = true; }
    catch (error) { report.cleanupError = error.message; }
  }
  report.pageErrors = errors;
  await writeFile(join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
