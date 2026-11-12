# DSH File Bridge

[简体中文](README.md) | **English**

Add a **Download to this device** action to DeepSeek Harness in a remote browser. Files are saved on the device viewing the page, alongside Harness's native previews and file lists.

Package: `dsh-plugin-file-bridge`.

## Features

- **Toolbar downloads:** open a file and use the download icon in the preview toolbar.
- **Download without a preview:** ZIP, XPI, and other unsupported formats get a download button in the preview placeholder.
- **Original contents and filenames:** binary files, Chinese filenames, spaces, and streamed large-file downloads.
- **Native previews:** documents, images, and spreadsheets continue to use Harness's existing viewers.
- **Native styling:** buttons, icons, tooltips, and light/dark themes match Harness.

### Download files

Choose **下载到本机 (Download to this device)** even when the file cannot be previewed.

![Download an unsupported file to the current device](docs/images/download.png)

### Preview and download

Read a document in its native viewer and download it from the toolbar.

![Native Markdown preview and toolbar download action](docs/images/preview.png)

## Installation

Verified with the Web profile of DeepSeek Harness **0.2.1-rc.3 / 0.2.1-rc.5 / 0.2.2-rc.2**.

```bash
dsh plugin --profile web add https://github.com/ousiqwq/dsh-file-bridge/releases/download/v0.1.2/dsh-plugin-file-bridge-0.1.2.tgz
```

Enable the plugin in the plugin manager and refresh the page. If the running instance has not loaded the new configuration, restart DSH and refresh. Packages are available from [Releases](https://github.com/ousiqwq/dsh-file-bridge/releases).

## Usage

1. Click a file link in a conversation or open a file from the native file list.
2. Click the toolbar's download icon or **下载到本机** in the preview placeholder.
3. Use your browser's downloads list to view progress, cancel, retry, or open the downloaded file.

Your browser controls the save location. To use a local application, open the downloaded file from your browser or file manager. Harness still controls its native **Open** action, which may open a server-side application in remote deployments.

## Behavior and scope

- Uses DSH's session file access, authentication, and Host/Origin checks.
- Reads through native file APIs and streams downloads; supports single HTTP ranges, HEAD, and Chinese filenames.
- Rejects or interrupts downloads if the file changes during transfer, avoiding mixed versions.
- Download addresses expire after five minutes. Click again after expiry or a service restart.
- Handles regular files rather than folder archives. Available previews depend on Harness and its installed viewers.
- Integrates through public document-action slots with no runtime npm dependencies.

## Development

Use Node.js 22+:

```bash
npm test
npm run check
npm pack
```

Browser checks require an accessible Harness instance and Playwright/Chromium:

```bash
DSH_TEST_URL=http://your-harness-host:3080 npm run test:browser
```

Set `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to reuse existing browser tools. Checks cover downloads, native previews, retries, and responsive layouts.

## License

[MIT](LICENSE) © 2026 osiqwq
