/// <reference types="vite/client" />

interface Window {
  desktopApi: {
    apiBaseUrl: string;
    transcribeWav: (bytes: Uint8Array, language: string) => Promise<string>;
    getRuntime: () => {
      platform: string;
      version: string;
    };
  };
}
