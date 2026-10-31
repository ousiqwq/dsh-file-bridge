import { randomBytes, createHash } from 'node:crypto';

export const PREPARE = '/api/file-bridge.prepare';
export const DOWNLOAD = '/api/file-bridge.download';
const MAX_BODY = 16384;
const commonHeaders = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export class DownloadError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function filenameOf(path) {
  // Both POSIX and Windows native file paths can be supplied by Harness.
  const leaf = path.split(/[\\/]/).pop() || 'download';
  return leaf.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_').toWellFormed();
}

export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\;%]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function byteRange(value, size) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) throw new DownloadError(416, 'range');
  const a = match[1] ? Number(match[1]) : undefined;
  const b = match[2] ? Number(match[2]) : undefined;
  if ((a !== undefined && !Number.isSafeInteger(a)) || (b !== undefined && !Number.isSafeInteger(b))) throw new DownloadError(416, 'range');
  const start = a ?? Math.max(0, size - b);
  const end = a === undefined || b === undefined ? size - 1 : Math.min(b, size - 1);
  if (start >= size || start > end) throw new DownloadError(416, 'range');
  return { start, end, partial: true };
}

function unchanged(before, after) {
  if (after.absolutePath !== before.absolutePath || after.version !== before.version || after.bytes !== before.bytes) throw new DownloadError(409, 'changed');
}

function errorResponse(error, extra = {}) {
  let status = error instanceof DownloadError ? error.status : 500;
  let code = error instanceof DownloadError ? error.code : 'unavailable';
  // Never return native exception messages (they may contain private paths).
  const native = String(error?.code || '');
  if (/not-found|ENOENT|ENOTDIR/.test(native)) { status = 404; code = 'missing'; }
  if (/not-regular-file/.test(native)) { status = 422; code = 'not-file'; }
  if (/denied|forbidden|EACCES|EPERM/.test(native)) { status = 403; code = 'forbidden'; }
  return Response.json({ error: code }, { status, headers: { ...commonHeaders, ...extra } });
}

async function jsonBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new DownloadError(415, 'invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new DownloadError(400, 'invalid');
  const parts = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new DownloadError(413, 'invalid'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new DownloadError(400, 'invalid'); }
}

/** The adapter only uses Harness's composed, policy-checked file service. */
export function createDownloads({ scopeFor, stat, readBytes, now = Date.now, ttl = 300000, maxTickets = 128, chunkSize = 65536 }) {
  const tickets = new Map(), lifetime = new AbortController();
  const sweep = () => { for (const [id, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(id); };
  const timer = setInterval(sweep, Math.min(ttl, 30000)); timer.unref();
  const signalFor = request => AbortSignal.any([request.signal, lifetime.signal]);
  async function scope(id, signal) {
    signal.throwIfAborted();
    const result = await scopeFor(id);
    if (!result) throw new DownloadError(404, 'session');
    return result;
  }
  async function prepare(request) {
    try {
      if (request.method !== 'POST') throw new DownloadError(405, 'method');
      const data = await jsonBody(request);
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 256 ||
          typeof data.path !== 'string' || !data.path || data.path.length > 8192 || /[\0\r\n]/.test(data.path)) throw new DownloadError(400, 'invalid');
      const signal = signalFor(request), currentScope = await scope(data.sessionId, signal);
      const info = await stat(currentScope, data.path, signal);
      if (!Number.isSafeInteger(info.bytes) || info.bytes < 0) throw new DownloadError(422, 'size');
      // Stat and byte access are separate capabilities in some filesystem backends.
      if (info.bytes) unchanged(info, await readBytes(currentScope, info.absolutePath, { range: { offset: 0, length: 1 } }, signal));
      signal.throwIfAborted(); sweep();
      if (tickets.size >= maxTickets) throw new DownloadError(429, 'busy');
      const token = randomBytes(24).toString('base64url'), filename = filenameOf(info.absolutePath);
      const ticket = { sessionId: data.sessionId, info, expires: now() + ttl };
      tickets.set(token, ticket);
      return Response.json({ url: DOWNLOAD + '?ticket=' + token, filename, bytes: info.bytes, expires: ticket.expires }, { headers: commonHeaders });
    } catch (error) { return errorResponse(error); }
  }
  async function download(request) {
    let size;
    try {
      if (!['GET', 'HEAD'].includes(request.method)) throw new DownloadError(405, 'method');
      sweep();
      const token = new URL(request.url).searchParams.get('ticket');
      const ticket = token && tickets.get(token);
      if (!ticket) throw new DownloadError(410, 'expired');
      const signal = signalFor(request), currentScope = await scope(ticket.sessionId, signal);
      const info = await stat(currentScope, ticket.info.absolutePath, signal);
      unchanged(ticket.info, info); size = info.bytes;
      const etag = '"' + createHash('sha256').update(info.absolutePath + '\0' + info.version + '\0' + size).digest('hex') + '"';
      const ifRange = request.headers.get('if-range');
      const range = byteRange(!ifRange || ifRange === etag ? request.headers.get('range') : null, size);
      const headers = { ...commonHeaders, 'content-type': 'application/octet-stream',
        'content-disposition': contentDisposition(filenameOf(info.absolutePath)),
        'content-length': String(range.end - range.start + 1), 'accept-ranges': 'bytes', etag,
        'content-security-policy': "default-src 'none'; sandbox" };
      if (range.partial) headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
      if (request.method === 'HEAD' || size === 0) return new Response(null, { status: range.partial ? 206 : 200, headers });
      const controller = new AbortController();
      const transferSignal = AbortSignal.any([signal, controller.signal]);
      let offset = range.start;
      async function next() {
        transferSignal.throwIfAborted();
        const length = Math.min(chunkSize, range.end - offset + 1);
        const result = await readBytes(currentScope, info.absolutePath, { range: { offset, length } }, transferSignal);
        unchanged(info, result);
        if (result.offset !== offset || result.data.byteLength !== length) throw new DownloadError(409, 'changed');
        offset += length;
        return result.data;
      }
      // Fail before writing success headers if the first policy-checked read fails.
      let first = await next();
      const body = new ReadableStream({
        async pull(stream) {
          try {
            transferSignal.throwIfAborted();
            const data = first ?? await next(); first = null;
            if (offset > range.end) {
              unchanged(info, await stat(currentScope, info.absolutePath, transferSignal));
              stream.enqueue(data);
              stream.close();
            } else stream.enqueue(data);
          } catch (error) { controller.abort(); stream.error(error); }
        },
        cancel() { first = null; controller.abort(); },
      }, { highWaterMark: 0 });
      return new Response(body, { status: range.partial ? 206 : 200, headers });
    } catch (error) {
      return errorResponse(error, error.status === 416 && size !== undefined ? { 'content-range': `bytes */${size}` } : {});
    }
  }
  return { prepare, download, dispose() { clearInterval(timer); tickets.clear(); lifetime.abort(); } };
}
