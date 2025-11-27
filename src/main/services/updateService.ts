/**
 * Update Service
 * Handles auto-updates using electron-updater
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IPC_CHANNELS, type UpdateInfo, type UpdateState } from '../../shared/types';

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private state: UpdateState = { status: 'idle' };
  private skippedVersion: string | null = null;
  private skippedVersionPath: string;

  constructor() {
    this.skippedVersionPath = join(app.getPath('userData'), 'skipped-version.json');
    this.loadSkippedVersion();
    this.setupAutoUpdater();
  }

  /**
   * Set the main window reference for IPC
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Load skipped version from disk
   */
  private loadSkippedVersion(): void {
    try {
      if (existsSync(this.skippedVersionPath)) {
        const data = JSON.parse(readFileSync(this.skippedVersionPath, 'utf-8'));
        this.skippedVersion = data.version || null;
        console.log('[UpdateService] Loaded skipped version:', this.skippedVersion);
      }
    } catch (error) {
      console.error('[UpdateService] Failed to load skipped version:', error);
    }
  }

  /**
   * Save skipped version to disk
   */
  private saveSkippedVersion(version: string | null): void {
    try {
      if (version) {
        writeFileSync(this.skippedVersionPath, JSON.stringify({ version }));
      } else {
        writeFileSync(this.skippedVersionPath, JSON.stringify({}));
      }
      this.skippedVersion = version;
      console.log('[UpdateService] Saved skipped version:', version);
    } catch (error) {
      console.error('[UpdateService] Failed to save skipped version:', error);
    }
  }

  /**
   * Get skipped version
   */
  getSkippedVersion(): string | null {
    return this.skippedVersion;
  }

  /**
   * Skip a specific version
   */
  skipVersion(version: string): void {
    this.saveSkippedVersion(version);
    this.updateState({ status: 'idle' });
  }

  /**
   * Setup electron-updater event handlers
   */
  private setupAutoUpdater(): void {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Error event
    autoUpdater.on('error', (error: Error) => {
      console.error('[UpdateService] Update error:', error);
      this.updateState({
        status: 'error',
        error: error.message,
      });
    });

    // Checking for update
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateService] Checking for updates...');
      this.updateState({ status: 'checking' });
    });

    // Update available
    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      console.log('[UpdateService] Update available:', info.version);

      // Check if this version is skipped
      if (this.skippedVersion === info.version) {
        console.log('[UpdateService] Skipping version:', info.version);
        this.updateState({ status: 'idle' });
        return;
      }

      const updateInfo: UpdateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      };

      this.updateState({
        status: 'available',
        info: updateInfo,
      });
    });

    // No update available
    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      console.log('[UpdateService] No update available. Current version:', info.version);
      this.updateState({
        status: 'not-available',
        info: {
          version: info.version,
          releaseDate: info.releaseDate,
        },
      });
    });

    // Download progress
    autoUpdater.on('download-progress', progress => {
      console.log(`[UpdateService] Download progress: ${progress.percent.toFixed(1)}%`);
      this.updateState({
        status: 'downloading',
        info: this.state.info,
        progress: {
          bytesPerSecond: progress.bytesPerSecond,
          percent: progress.percent,
          total: progress.total,
          transferred: progress.transferred,
        },
      });
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      console.log('[UpdateService] Update downloaded:', info.version);

      // Clear skipped version since we have a new update
      if (this.skippedVersion && this.skippedVersion !== info.version) {
        this.saveSkippedVersion(null);
      }

      this.updateState({
        status: 'downloaded',
        info: {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
        },
      });
    });
  }

  /**
   * Update state and notify renderer
   */
  private updateState(newState: UpdateState): void {
    this.state = newState;
    this.notifyRenderer();
  }

  /**
   * Notify renderer of state change
   */
  private notifyRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, this.state);
    }
  }

  /**
   * Get current state
   */
  getState(): UpdateState {
    return this.state;
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('[UpdateService] Failed to check for updates:', error);
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      });
    }
  }

  /**
   * Download the available update
   */
  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('[UpdateService] Failed to download update:', error);
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to download update',
      });
    }
  }

  /**
   * Install the downloaded update and restart
   */
  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Dismiss the update notification (ignore for now)
   */
  dismissUpdate(): void {
    this.updateState({ status: 'idle' });
  }
}
