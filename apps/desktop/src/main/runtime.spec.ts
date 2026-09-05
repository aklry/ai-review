import { describe, expect, it, vi } from 'vitest';
import { sandboxedPreloadBuild } from '../../electron.vite.config.js';
import {
  configureElectronRuntime,
  shouldOpenDevTools,
  shouldUseRendererSandbox,
} from './runtime.js';

describe('configureElectronRuntime', () => {
  it('disables renderer sandbox only for the development renderer', () => {
    expect(shouldUseRendererSandbox('http://localhost:5173')).toBe(false);
    expect(shouldUseRendererSandbox(undefined)).toBe(true);
  });

  it('builds the sandboxed preload as CommonJS', () => {
    expect(sandboxedPreloadBuild.rollupOptions.output.format).toBe('cjs');
  });

  it('disables hardware acceleration before the app is ready', () => {
    const electronApp = {
      disableHardwareAcceleration: vi.fn(),
      commandLine: {
        appendSwitch: vi.fn(),
      },
    };

    configureElectronRuntime(electronApp);

    expect(electronApp.disableHardwareAcceleration).toHaveBeenCalledOnce();
    expect(electronApp.commandLine.appendSwitch).toHaveBeenCalledWith('disable-gpu');
    expect(electronApp.commandLine.appendSwitch).toHaveBeenCalledWith('in-process-gpu');
  });

  it('opens devtools automatically for unpackaged desktop runs', () => {
    expect(shouldOpenDevTools(false)).toBe(true);
  });

  it('keeps devtools closed for packaged desktop runs', () => {
    expect(shouldOpenDevTools(true)).toBe(false);
  });
});
