import { ElectronAPI } from '@electron-toolkit/preload';
import type {
  AppSettings,
  CalibrationSettings,
  CalibrationState,
  EnrichedItem,
  ScanResult,
  UpdateState,
} from '../shared/types';

interface RaiderScannerAPI {
  // Settings
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: Partial<AppSettings>): Promise<AppSettings>;

  // Scanning
  requestScan(): void;

  // Search
  searchItem(query: string): Promise<Array<{ item: EnrichedItem; score: number }>>;

  // Overlay control
  setOverlayInteractive(interactive: boolean): void;
  hideOverlay(): void;
  resizeOverlay(width: number, height: number): void;

  // Data
  getDataStats(): Promise<{
    items: number;
    quests: number;
    trades: number;
    hideoutStations: number;
  }>;
  getItem(itemId: string): Promise<EnrichedItem | undefined>;

  // Calibration
  getCalibration(): Promise<CalibrationSettings>;
  startCalibration(): void;
  cancelCalibration(): void;
  captureCalibration(): Promise<boolean>;
  onCalibrationUpdate(callback: (state: CalibrationState) => void): () => void;

  // Settings panel state
  setSettingsOpen(isOpen: boolean): void;

  // Updates
  checkForUpdates(): void;
  downloadUpdate(): void;
  installUpdate(): void;
  skipUpdate(version: string): void;
  getSkippedVersion(): Promise<string | null>;
  onUpdateStatus(callback: (state: UpdateState) => void): () => void;

  // Event listeners (return cleanup function)
  onScanResult(callback: (result: ScanResult) => void): () => void;
  onDataLoaded(callback: (stats: unknown) => void): () => void;
  onOverlayShow(callback: () => void): () => void;
  onOverlayHide(callback: () => void): () => void;
  onOverlayPauseTimer(callback: () => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: RaiderScannerAPI;
  }
}
