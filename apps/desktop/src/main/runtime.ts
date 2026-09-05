export type ElectronRuntimeApp = {
  disableHardwareAcceleration(): void;
  commandLine: {
    appendSwitch(switchName: string): void;
  };
};

export function shouldUseRendererSandbox(rendererUrl: string | undefined): boolean {
  return !rendererUrl;
}

export function shouldOpenDevTools(isPackaged: boolean): boolean {
  return !isPackaged;
}

export function configureElectronRuntime(app: ElectronRuntimeApp): void {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');
  app.disableHardwareAcceleration();
}
