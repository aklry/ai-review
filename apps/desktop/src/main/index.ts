import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import {
  configureElectronRuntime,
  shouldOpenDevTools,
  shouldUseRendererSandbox,
} from './runtime.js';

const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const rendererPath = fileURLToPath(new URL('../renderer/index.html', import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL;

configureElectronRuntime(app);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: shouldUseRendererSandbox(rendererUrl),
    },
  });

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error(
          `[renderer] failed to load (${errorCode}): ${errorDescription} - ${validatedURL}`,
        );
      }
    },
  );
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[preload] failed to load ${preloadPath}: ${error.message}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason} (${details.exitCode})`);
  });
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      console.error(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });

  window.webContents.once('did-finish-load', () => {
    if (shouldOpenDevTools(app.isPackaged)) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl).catch((error: unknown) => {
      console.error(`[renderer] loadURL failed: ${getErrorMessage(error)}`);
    });
  } else {
    void window.loadFile(rendererPath).catch((error: unknown) => {
      console.error(`[renderer] loadFile failed: ${getErrorMessage(error)}`);
    });
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
