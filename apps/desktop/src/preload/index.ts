import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktopApi', {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000/api',
  getRuntime: () => ({
    platform: process.platform,
    version: process.versions.electron,
  }),
});
