interface Window {
  desktopApi: {
    apiBaseUrl: string;
    getRuntime: () => {
      platform: string;
      version: string;
    };
  };
}

/// <reference types="vite/client" />
