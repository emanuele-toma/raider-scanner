/**
 * Preload Script
 * Exposes safe IPC methods to the renderer process
 */

import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AppSettings,
  type CalibrationSettings,
  type CalibrationState,
  type ScanResult,
  type UpdateState,
} from '../shared/types';

// Custom APIs for renderer
const api = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),

  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, settings),

  // Scanning
  requestScan: (): void => ipcRenderer.send(IPC_CHANNELS.REQUEST_SCAN),

  // Search
  searchItem: (query: string): Promise<unknown[]> => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_ITEM, query),

  // Overlay control
  setOverlayInteractive: (interactive: boolean): void =>
    ipcRenderer.send(IPC_CHANNELS.SET_OVERLAY_INTERACTIVE, interactive),

  hideOverlay: (): void => ipcRenderer.send(IPC_CHANNELS.HIDE_OVERLAY),

  resizeOverlay: (width: number, height: number): void => ipcRenderer.send('resize-overlay', width, height),

  // Data
  getDataStats: (): Promise<{ items: number; quests: number; trades: number; hideoutStations: number; bots: number }> =>
    ipcRenderer.invoke('get-data-stats'),

  getItem: (itemId: string): Promise<unknown> => ipcRenderer.invoke('get-item', itemId),

  getBot: (botId: string): Promise<unknown> => ipcRenderer.invoke('get-bot', botId),

  getAllBots: (): Promise<unknown[]> => ipcRenderer.invoke('get-all-bots'),

  // Quests
  getAllQuests: (): Promise<unknown[]> => ipcRenderer.invoke('get-all-quests'),

  getCompletedQuests: (): Promise<string[]> => ipcRenderer.invoke('get-completed-quests'),

  setQuestCompleted: (questId: string, completed: boolean): Promise<string[]> =>
    ipcRenderer.invoke('set-quest-completed', questId, completed),

  getInProgressQuests: (): Promise<string[]> => ipcRenderer.invoke('get-in-progress-quests'),

  setQuestInProgress: (questId: string, inProgress: boolean): Promise<string[]> =>
    ipcRenderer.invoke('set-quest-in-progress', questId, inProgress),

  // Hideout
  getAllHideoutStations: (): Promise<unknown[]> => ipcRenderer.invoke('get-all-hideout-stations'),

  getStationLevels: (): Promise<Record<string, number>> => ipcRenderer.invoke('get-station-levels'),

  setStationLevel: (stationId: string, level: number): Promise<Record<string, number>> =>
    ipcRenderer.invoke('set-station-level', stationId, level),

  // Calibration
  getCalibration: (): Promise<CalibrationSettings> => ipcRenderer.invoke(IPC_CHANNELS.GET_CALIBRATION),

  startCalibration: (): void => ipcRenderer.send(IPC_CHANNELS.START_CALIBRATION),

  cancelCalibration: (): void => ipcRenderer.send(IPC_CHANNELS.CANCEL_CALIBRATION),

  captureCalibration: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CALIBRATION_CAPTURE),

  // Settings panel state (to disable hotkeys while recording new ones)
  setHotkeyRecording: (isRecording: boolean): void => ipcRenderer.send(IPC_CHANNELS.SET_HOTKEY_RECORDING, isRecording),

  onCalibrationUpdate: (callback: (state: CalibrationState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CalibrationState): void => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.CALIBRATION_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CALIBRATION_UPDATE, handler);
  },

  // Event listeners
  onScanResult: (callback: (result: ScanResult) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ScanResult): void => {
      callback(result);
    };
    ipcRenderer.on(IPC_CHANNELS.SCAN_RESULT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_RESULT, handler);
  },

  onDataLoaded: (callback: (stats: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, stats: unknown): void => {
      callback(stats);
    };
    ipcRenderer.on(IPC_CHANNELS.DATA_LOADED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DATA_LOADED, handler);
  },

  onOverlayShow: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_SHOW, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_SHOW, handler);
  },

  onOverlayHide: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_HIDE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_HIDE, handler);
  },

  onOverlayPauseTimer: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_PAUSE_TIMER, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_PAUSE_TIMER, handler);
  },

  // Updates
  checkForUpdates: (): void => ipcRenderer.send(IPC_CHANNELS.CHECK_FOR_UPDATES),

  downloadUpdate: (): void => ipcRenderer.send(IPC_CHANNELS.DOWNLOAD_UPDATE),

  installUpdate: (): void => ipcRenderer.send(IPC_CHANNELS.INSTALL_UPDATE),

  skipUpdate: (version: string): void => ipcRenderer.send(IPC_CHANNELS.SKIP_UPDATE, version),

  getSkippedVersion: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.GET_SKIPPED_VERSION),

  onUpdateStatus: (callback: (state: UpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
  },
};

// Expose APIs
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
