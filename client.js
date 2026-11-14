window.__ModuleLoader__.load({
  id: 'dsh-plugin-file-bridge',
  factory: require => {
    const React = require('react'), h = React.createElement;
    const { Button, Toast, IconDownloadOutlineRegular, IconWarningOutlineRegular, Tooltip } = require('@deepseek-ai/dsh-client-ui-primitives');
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
.dfb-action{position:relative;display:inline-flex;flex:none;align-self:center;align-items:center;max-width:100%;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}
.dfb-button{flex:none;max-width:100%}.dfb-icon-button{width:28px;padding:0}
.dfb-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;
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
        setBusy(true); setError(''); setMessage('preparing');
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
          setMessage('started');
        } catch (cause) {
          if (controller.signal.aborted) return;
          setMessage(''); setError(Object.hasOwn(zh, cause.message) ? cause.message : 'unavailable');
        } finally {
          if (active.current === controller) { active.current = null; setBusy(false); }
        }
      }
      return h('span', { className: 'dfb-action', 'data-expanded': expanded || undefined },
        h(Tooltip, { portal: true, label: busy ? t('preparing') : t('download'), side: 'bottom', delayMs: 500 },
          h(Button, { variant:expanded?'outline':'ghost',size:expanded?'md':'sm',className: expanded?'dfb-button':'dfb-button dfb-icon-button', onClick: download, disabled: busy || !sessionId,
            icon:h(IconDownloadOutlineRegular,{size:16}),'aria-label': t('download'), 'aria-busy': busy },
            expanded && h('span', null, busy ? t('preparing') : t('download')))),
        h('span', { className: 'dfb-live', role: 'status', 'aria-live': 'polite' }, message ? t(message) : ''),
        error && h(Toast, {key:sessionId+':'+absolutePath+':'+error,text:t(error),icon:h(IconWarningOutlineRegular,{size:16}),holdMs:6000,onDone:()=>setError('')}));
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
