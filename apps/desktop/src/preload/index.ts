import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopApi', {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api',
  transcribeWav: (bytes: Uint8Array, language: string) =>
    ipcRenderer.invoke('speech:transcribe', bytes, language),
  getRuntime: () => ({
    platform: process.platform,
    version: process.versions.electron,
  }),
});
