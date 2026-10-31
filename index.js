import { createDownloads, PREPARE, DOWNLOAD } from './download.js';

export const name = 'file-bridge';
export const inject = ['connection', 'workspaceFiles', 'sessions', 'sandboxPolicy'];

export function apply(ctx) {
  const downloads = createDownloads({
    async scopeFor(sessionId) {
      // Match the native workspaceFileScope lookup; do not activate an Agent.
      const live = ctx.sessions.get(sessionId)?.header;
      const stored = live === undefined ? await ctx.get('sessionPersistence')?.stat(sessionId) : undefined;
      const header = live ?? stored?.header;
      return header && { sessionId, workspaceRoot: header.cwd ?? ctx.sandboxPolicy.workspaceRoot };
    },
    stat: (...args) => ctx.workspaceFiles.stat(...args),
    readBytes: (...args) => ctx.workspaceFiles.readBytes(...args),
  });
  ctx.effect(() => () => downloads.dispose(), 'file-bridge: downloads lifetime');
  // Both routes use Connection's owner authentication and Host/Origin fence.
  // A ticket is never an authentication bypass or a public file-share link.
  ctx.connection.fetch.register({ path: PREPARE, methods: ['POST'], requestBody: 'streaming', fetch: downloads.prepare });
  ctx.connection.fetch.register({ path: DOWNLOAD, methods: ['GET', 'HEAD'], requestBody: 'buffered', fetch: downloads.download });
}
