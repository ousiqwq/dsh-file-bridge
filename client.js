window.__ModuleLoader__.load({
  id: 'dsh-plugin-file-bridge',
  factory: require => {
    const React = require('react'), h = React.createElement;
    const NS = 'fileBridge';
    const zh = {
      download: '下载到本机', preparing: '正在准备下载…', started: '已交给浏览器下载，请查看下载列表',
      session: '当前文件的会话不可用，请重新打开文件', expired: '下载已过期，请重试',
      changed: '文件已变更，请重新下载', missing: '文件不存在或已移动',
      'not-file': '仅支持下载普通文件', forbidden: '当前无权读取此文件',
      size: '无法确定文件大小', busy: '下载请求过多，请稍后再试',
      invalid: '下载参数无效', unavailable: '下载准备失败，请重试',
      auth: '连接或登录已失效，请刷新页面后重试',
    };
    const en = {
      download: 'Download to this device', preparing: 'Preparing download…', started: 'Sent to your browser; check Downloads',
      session: 'File session is unavailable; reopen the file', expired: 'Download expired; please retry',
      changed: 'File changed; please download again', missing: 'File is missing or was moved',
      'not-file': 'Only regular files can be downloaded', forbidden: 'File access was denied',
      size: 'File size is unavailable', busy: 'Too many downloads; please try later',
      invalid: 'Invalid download request', unavailable: 'Could not prepare download; please retry',
      auth: 'Connection or login expired; reload the page and retry',
    };
    const css = `
.dfb-action{position:relative;display:inline-flex;flex:none;align-items:center;max-width:100%;color:var(--dsw-alias-label-primary,inherit)}
.dfb-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:28px;min-height:28px;padding:5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:12px;cursor:pointer}
.dfb-button:hover:not(:disabled){color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.dfb-button:focus-visible{outline:2px solid #80aaff;outline-offset:2px}.dfb-button:disabled{opacity:.55;cursor:wait}
.dfb-button svg{width:16px;height:16px;flex:none}.dfb-action[data-expanded] .dfb-button{border:1px solid var(--dsw-alias-border-l2,#555);padding:7px 12px;min-height:34px}
.dfb-error{position:absolute;z-index:40;top:calc(100% + 6px);right:0;width:max-content;max-width:min(260px,65vw);padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#555);border-radius:8px;background:var(--dsw-alias-bg-module-platform,#292a2b);color:var(--dsw-alias-label-primary,#fff);font-size:12px;line-height:1.5;overflow-wrap:anywhere;box-shadow:0 4px 16px #0003}
.dfb-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;
    function Icon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4' }));
    }
    function DownloadAction({ sessionId, absolutePath, t, expanded = false }) {
      const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState(''), [error, setError] = React.useState('');
      const active = React.useRef(null);
      React.useEffect(() => {
        setBusy(false); setMessage(''); setError('');
        return () => { active.current?.abort(); active.current = null; };
      }, [sessionId, absolutePath]);
      async function download() {
        if (active.current) return;
        const controller = new AbortController(); active.current = controller;
        setBusy(true); setError(''); setMessage(t('preparing'));
        try {
          const response = await fetch('/api/file-bridge.prepare', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, path: absolutePath }),
          });
          const result = await response.json().catch(() => ({ error: [401, 403].includes(response.status) ? 'auth' : 'unavailable' }));
          if (!response.ok) throw new Error(result.error || 'unavailable');
          const url = new URL(result.url, window.location.href);
          if (url.origin !== window.location.origin || url.pathname !== '/api/file-bridge.download') throw new Error('unavailable');
          controller.signal.throwIfAborted();
          const link = document.createElement('a');
          link.href = url.href; link.download = result.filename; link.rel = 'noreferrer'; link.hidden = true;
          document.body.appendChild(link);
          try { link.click(); } finally { link.remove(); }
          setMessage(t('started'));
        } catch (cause) {
          if (controller.signal.aborted) return;
          setMessage(''); setError(t(Object.hasOwn(zh, cause.message) ? cause.message : 'unavailable'));
        } finally {
          if (active.current === controller) { active.current = null; setBusy(false); }
        }
      }
      return h('span', { className: 'dfb-action', 'data-expanded': expanded || undefined },
        h('button', { className: 'dfb-button', type: 'button', onClick: download, disabled: busy || !sessionId,
          title: busy ? t('preparing') : t('download'), 'aria-label': t('download'), 'aria-busy': busy },
          h(Icon), expanded && h('span', null, busy ? t('preparing') : t('download'))),
        h('span', { className: 'dfb-live', role: 'status', 'aria-live': 'polite' }, message),
        error && h('span', { className: 'dfb-error', role: 'alert' }, error));
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => { const style = document.createElement('style'); style.dataset.dshFileBridge = ''; style.textContent = css; document.head.appendChild(style); return () => style.remove(); });
        ctx.effect(() => ctx.locale.register(NS, { zh, en }));
        for (const [slot, expanded] of [['sidebar.right.tab.document.actions', false], ['sidebar.right.tab.document.unpreviewable', true]]) {
          ctx.effect(() => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, id: 'file-bridge.download', order: 10, locale: NS },
            props => h(DownloadAction, { ...props, expanded }))));
        }
      },
    };
  },
});
