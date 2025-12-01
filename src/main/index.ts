/**
 * Raider Scanner - Main Process
 * ARC Raiders Item Overlay Application
 */

import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { IPC_CHANNELS, type AppSettings, type CalibrationState, type ScanResult } from '../shared/types';
import { CalibrationService } from './services/calibrationService';
import { DataService } from './services/dataService';
import { OCRService } from './services/ocrService';
import { SearchService } from './services/searchService';
import { UpdateService } from './services/updateService';

// Services
let dataService: DataService;
let ocrService: OCRService;
let searchService: SearchService;
let calibrationService: CalibrationService;
let updateService: UpdateService;

// Windows
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Logging
let logPath: string;

/**
 * Get log file path
 */
function getLogPath(): string {
  return join(app.getPath('userData'), 'raider-scanner.log');
}

/**
 * Write to log file
 */
function writeToLog(level: string, ...args: unknown[]): void {
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    appendFileSync(logPath, logLine);
  } catch {
    // Silently fail if logging fails
  }
}

/**
 * Setup logging to file
 */
function setupLogging(): void {
  logPath = getLogPath();

  // Clear log file on startup (keep it from growing too large)
  try {
    writeFileSync(logPath, `=== Raider Scanner Log - Started ${new Date().toISOString()} ===\n`);
  } catch {
    // Ignore if we can't write
  }

  // Override console methods to also write to file
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    writeToLog('INFO', ...args);
  };

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    writeToLog('ERROR', ...args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    writeToLog('WARN', ...args);
  };

  console.log('[Logger] Logging initialized, writing to', logPath);
}

// Settings
const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'CommandOrControl+Shift+D',
  closeOverlayHotkey: 'CommandOrControl+Shift+C',
  pauseTimerHotkey: 'CommandOrControl+Shift+P',
  scanRegionSize: 400,
  appLanguage: 'en',
  gameLanguage: 'en',
  theme: 'dark',
  overlayOpacity: 0.95,
  overlayWidth: 480,
  autoHideDelay: 5000,
  crtEffect: true,
};

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let settingsPath: string;

// Completed quests storage
let completedQuests: Set<string> = new Set();
let completedQuestsPath: string;

// In-progress quests storage
let inProgressQuests: Set<string> = new Set();
let inProgressQuestsPath: string;

// Station levels storage (stationId -> current level)
let stationLevels: Record<string, number> = {};
let stationLevelsPath: string;

/**
 * Get settings file path
 */
function getSettingsPath(): string {
  return join(app.getPath('userData'), 'raider-scanner-settings.json');
}

/**
 * Load settings from disk
 */
function loadSettings(): void {
  try {
    settingsPath = getSettingsPath();
    if (existsSync(settingsPath)) {
      const data = readFileSync(settingsPath, 'utf-8');
      const loaded = JSON.parse(data);
      // Merge with defaults to ensure new settings are included
      settings = { ...DEFAULT_SETTINGS, ...loaded };
      console.log('[Settings] Loaded settings from', settingsPath);
    } else {
      console.log('[Settings] No settings file found, using defaults');
    }
  } catch (error) {
    console.error('[Settings] Failed to load settings:', error);
  }
}

/**
 * Save settings to disk
 */
function saveSettings(): void {
  try {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('[Settings] Saved settings');
  } catch (error) {
    console.error('[Settings] Failed to save settings:', error);
  }
}

/**
 * Get completed quests file path
 */
function getCompletedQuestsPath(): string {
  return join(app.getPath('userData'), 'completed-quests.json');
}

/**
 * Get in-progress quests file path
 */
function getInProgressQuestsPath(): string {
  return join(app.getPath('userData'), 'in-progress-quests.json');
}

/**
 * Load completed quests from disk
 */
function loadCompletedQuests(): void {
  try {
    completedQuestsPath = getCompletedQuestsPath();
    if (existsSync(completedQuestsPath)) {
      const data = readFileSync(completedQuestsPath, 'utf-8');
      const loaded = JSON.parse(data);
      completedQuests = new Set(loaded);
      console.log('[Quests] Loaded', completedQuests.size, 'completed quests');
    } else {
      console.log('[Quests] No completed quests file found');
    }
  } catch (error) {
    console.error('[Quests] Failed to load completed quests:', error);
  }
}

/**
 * Load in-progress quests from disk
 */
function loadInProgressQuests(): void {
  try {
    inProgressQuestsPath = getInProgressQuestsPath();
    if (existsSync(inProgressQuestsPath)) {
      const data = readFileSync(inProgressQuestsPath, 'utf-8');
      const loaded = JSON.parse(data);
      inProgressQuests = new Set(loaded);
      console.log('[Quests] Loaded', inProgressQuests.size, 'in-progress quests');
    } else {
      console.log('[Quests] No in-progress quests file found');
    }
  } catch (error) {
    console.error('[Quests] Failed to load in-progress quests:', error);
  }
}

/**
 * Save completed quests to disk
 */
function saveCompletedQuests(): void {
  try {
    writeFileSync(completedQuestsPath, JSON.stringify(Array.from(completedQuests)));
    console.log('[Quests] Saved completed quests');
  } catch (error) {
    console.error('[Quests] Failed to save completed quests:', error);
  }
}

/**
 * Save in-progress quests to disk
 */
function saveInProgressQuests(): void {
  try {
    writeFileSync(inProgressQuestsPath, JSON.stringify(Array.from(inProgressQuests)));
    console.log('[Quests] Saved in-progress quests');
  } catch (error) {
    console.error('[Quests] Failed to save in-progress quests:', error);
  }
}

/**
 * Get station levels file path
 */
function getStationLevelsPath(): string {
  return join(app.getPath('userData'), 'station-levels.json');
}

/**
 * Load station levels from disk
 */
function loadStationLevels(): void {
  try {
    stationLevelsPath = getStationLevelsPath();
    if (existsSync(stationLevelsPath)) {
      const data = readFileSync(stationLevelsPath, 'utf-8');
      stationLevels = JSON.parse(data);
      console.log('[Hideout] Loaded station levels:', Object.keys(stationLevels).length, 'stations');
    } else {
      console.log('[Hideout] No station levels file found');
    }
  } catch (error) {
    console.error('[Hideout] Failed to load station levels:', error);
  }
}

/**
 * Save station levels to disk
 */
function saveStationLevels(): void {
  try {
    writeFileSync(stationLevelsPath, JSON.stringify(stationLevels));
    console.log('[Hideout] Saved station levels');
  } catch (error) {
    console.error('[Hideout] Failed to save station levels:', error);
  }
}

// State
let isScanning = false;
let autoHideTimer: NodeJS.Timeout | null = null;

/**
 * Get the data path for arcraiders-data
 */
function getDataPath(): string {
  if (is.dev) {
    return join(__dirname, '../../src/arcraiders-data');
  }
  return join(process.resourcesPath, 'arcraiders-data');
}

/**
 * Get the icon path
 */
function getIconPath(): string {
  if (is.dev) {
    return join(__dirname, '../../build/icon.ico');
  }
  return join(process.resourcesPath, '../build/icon.ico');
}

/**
 * Create the main settings window
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 800,
    minHeight: 700,
    maxWidth: 800,
    maxHeight: 700,
    resizable: false,
    show: false,
    frame: false,
    icon: getIconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a0a2e',
      symbolColor: '#00ffff',
      height: 32,
    },
    backgroundColor: '#1a0a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Quit the app when main window is closed
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Create the overlay window
 * This is the transparent, always-on-top window for displaying results
 */
function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 1, // Will be resized based on content
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    type: 'toolbar', // Helps with click-through on Windows
    useContentSize: true, // Size based on content
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  // Set always on top with highest level to stay above fullscreen games
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Make the window click-through by default
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Load overlay page
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`);
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'));
  }
}

/**
 * Show overlay at cursor position with scan result
 */
function showOverlay(result: ScanResult): void {
  if (!overlayWindow) {
    createOverlayWindow();
  }

  // Clear any existing auto-hide timer
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  // Get cursor position and store it for repositioning after resize
  const cursorPos = screen.getCursorScreenPoint();
  overlayWindow?.setPosition(cursorPos.x + 20, cursorPos.y + 20);
  overlayWindow?.webContents.send(IPC_CHANNELS.SCAN_RESULT, result);

  // Also send to main window so it can display the item
  mainWindow?.webContents.send(IPC_CHANNELS.SCAN_RESULT, result);

  overlayWindow?.showInactive(); // Don't steal focus from game

  // Register overlay-specific hotkeys when overlay is shown
  registerOverlayHotkeys();

  // Auto-hide after delay
  autoHideTimer = setTimeout(() => {
    hideOverlay();
  }, settings.autoHideDelay);
}

/**
 * Hide the overlay
 */
function hideOverlay(): void {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
  overlayWindow?.hide();

  // Unregister overlay-specific hotkeys when overlay is hidden
  unregisterOverlayHotkeys();
}

/**
 * Toggle the overlay timer (pause/resume auto-hide)
 */
function toggleOverlayTimer(): void {
  // Clear the main process timer if running
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
  // Notify the overlay to toggle its countdown
  overlayWindow?.webContents.send(IPC_CHANNELS.OVERLAY_PAUSE_TIMER);
}

/**
 * Perform a scan at current cursor position
 */
async function performScan(): Promise<void> {
  if (isScanning) {
    console.log('[Main] Scan already in progress, skipping...');
    return;
  }

  isScanning = true;
  console.log('[Main] Starting scan (color-based tooltip detection)...');

  // If overlay is visible, hide it first and wait before scanning
  // This prevents the overlay from covering the tooltip we want to scan
  if (overlayWindow?.isVisible()) {
    console.log('[Main] Overlay is visible, hiding before scan...');
    hideOverlay();
    // Wait for overlay to fully hide before scanning
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  try {
    // Perform OCR scan
    const ocrResult = await ocrService.scan();

    if (!ocrResult || !ocrResult.text) {
      console.log('[Main] No text detected');
      showOverlay({
        success: false,
        error: 'No tooltip detected on screen',
        timestamp: Date.now(),
      });
      return;
    }

    console.log(`[Main] OCR Result: "${ocrResult.text}" (${ocrResult.confidence}%)`);

    // Search for matching item
    const match = searchService.findBestMatch(ocrResult.text, 0.5);

    if (match) {
      console.log(`[Main] Found match: ${match.item.name.en}`);
      showOverlay({
        success: true,
        ocrText: ocrResult.text,
        matchedItem: match.item,
        confidence: match.confidence,
        timestamp: Date.now(),
      });
    } else {
      console.log('[Main] No matching item found');
      showOverlay({
        success: false,
        ocrText: ocrResult.text,
        error: 'No matching item found',
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error('[Main] Scan error:', error);
    showOverlay({
      success: false,
      error: error instanceof Error ? error.message : 'Scan failed',
      timestamp: Date.now(),
    });
  } finally {
    isScanning = false;
  }
}

/**
 * Register global hotkeys (scan hotkey only - always active)
 */
function registerHotkeys(): void {
  // Unregister existing hotkeys
  globalShortcut.unregisterAll();

  // Register scan hotkey (always active)
  const scanSuccess = globalShortcut.register(settings.hotkey, () => {
    console.log(`[Main] Scan hotkey pressed: ${settings.hotkey}`);
    performScan();
  });

  if (scanSuccess) {
    console.log(`[Main] Scan hotkey registered: ${settings.hotkey}`);
  } else {
    console.error(`[Main] Failed to register scan hotkey: ${settings.hotkey}`);
  }
}

/**
 * Register overlay-specific hotkeys (only when overlay is visible)
 */
function registerOverlayHotkeys(): void {
  // Register close overlay hotkey
  if (!globalShortcut.isRegistered(settings.closeOverlayHotkey)) {
    const closeSuccess = globalShortcut.register(settings.closeOverlayHotkey, () => {
      console.log(`[Main] Close overlay hotkey pressed: ${settings.closeOverlayHotkey}`);
      hideOverlay();
    });

    if (closeSuccess) {
      console.log(`[Main] Close overlay hotkey registered: ${settings.closeOverlayHotkey}`);
    } else {
      console.error(`[Main] Failed to register close overlay hotkey: ${settings.closeOverlayHotkey}`);
    }
  }

  // Register pause/resume timer hotkey
  if (!globalShortcut.isRegistered(settings.pauseTimerHotkey)) {
    const pauseSuccess = globalShortcut.register(settings.pauseTimerHotkey, () => {
      console.log(`[Main] Toggle timer hotkey pressed: ${settings.pauseTimerHotkey}`);
      toggleOverlayTimer();
    });

    if (pauseSuccess) {
      console.log(`[Main] Pause timer hotkey registered: ${settings.pauseTimerHotkey}`);
    } else {
      console.error(`[Main] Failed to register pause timer hotkey: ${settings.pauseTimerHotkey}`);
    }
  }
}

/**
 * Unregister overlay-specific hotkeys
 */
function unregisterOverlayHotkeys(): void {
  globalShortcut.unregister(settings.closeOverlayHotkey);
  globalShortcut.unregister(settings.pauseTimerHotkey);
  console.log('[Main] Overlay hotkeys unregistered');
}

/**
 * Setup IPC handlers
 */
function setupIPC(): void {
  // Get settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => settings);

  // Update settings
  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, async (_event, newSettings: Partial<AppSettings>) => {
    const hotkeyChanged = newSettings.hotkey && newSettings.hotkey !== settings.hotkey;
    const closeHotkeyChanged =
      newSettings.closeOverlayHotkey && newSettings.closeOverlayHotkey !== settings.closeOverlayHotkey;
    const pauseHotkeyChanged =
      newSettings.pauseTimerHotkey && newSettings.pauseTimerHotkey !== settings.pauseTimerHotkey;
    const gameLanguageChanged = newSettings.gameLanguage && newSettings.gameLanguage !== settings.gameLanguage;

    settings = { ...settings, ...newSettings };

    if (hotkeyChanged || closeHotkeyChanged || pauseHotkeyChanged) {
      registerHotkeys();
    }

    // Update search service and OCR language if game language changed
    if (gameLanguageChanged) {
      if (searchService) {
        searchService.setLanguage(settings.gameLanguage);
      }
      if (ocrService) {
        await ocrService.setLanguage(settings.gameLanguage);
      }
    }

    // Save settings to disk
    saveSettings();

    return settings;
  });

  // Manual scan request
  ipcMain.on(IPC_CHANNELS.REQUEST_SCAN, () => {
    performScan();
  });

  // Search item
  ipcMain.handle(IPC_CHANNELS.SEARCH_ITEM, (_event, query: string) => {
    return searchService.search(query, 10);
  });

  // Hide overlay
  ipcMain.on(IPC_CHANNELS.HIDE_OVERLAY, () => {
    hideOverlay();
  });

  // Resize overlay window to fit content and reposition to stay on screen
  ipcMain.on('resize-overlay', (_event, width: number, height: number) => {
    if (overlayWindow) {
      overlayWindow.setContentSize(width, height);

      // Reposition to ensure it stays within screen bounds
      const [currentX, currentY] = overlayWindow.getPosition();
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

      let x = currentX;
      let y = currentY;

      // Adjust if going off-screen
      if (x + width > screenWidth) {
        x = screenWidth - width - 10;
      }
      if (y + height > screenHeight) {
        y = screenHeight - height - 10;
      }
      if (x < 0) x = 10;
      if (y < 0) y = 10;

      if (x !== currentX || y !== currentY) {
        overlayWindow.setPosition(Math.floor(x), Math.floor(y));
      }
    }
  });

  // Get data stats
  ipcMain.handle('get-data-stats', () => {
    return dataService.getStats();
  });

  // Get item by ID
  ipcMain.handle('get-item', (_event, itemId: string) => {
    return dataService.getItem(itemId);
  });

  // Get bot by ID
  ipcMain.handle('get-bot', (_event, botId: string) => {
    return dataService.getBot(botId);
  });

  // Get all bots
  ipcMain.handle('get-all-bots', () => {
    return dataService.getAllBots();
  });

  // Get all quests
  ipcMain.handle('get-all-quests', () => {
    return dataService.getAllQuests();
  });

  // Get completed quests
  ipcMain.handle('get-completed-quests', () => {
    return Array.from(completedQuests);
  });

  // Set quest completion status
  ipcMain.handle('set-quest-completed', (_event, questId: string, completed: boolean) => {
    if (completed) {
      completedQuests.add(questId);
      // Remove from in-progress when completed
      inProgressQuests.delete(questId);
      saveInProgressQuests();
    } else {
      completedQuests.delete(questId);
    }
    saveCompletedQuests();
    return Array.from(completedQuests);
  });

  // Get in-progress quests
  ipcMain.handle('get-in-progress-quests', () => {
    return Array.from(inProgressQuests);
  });

  // Set quest in-progress status
  ipcMain.handle('set-quest-in-progress', (_event, questId: string, inProgress: boolean) => {
    if (inProgress) {
      inProgressQuests.add(questId);
      // Remove from completed when set to in-progress
      completedQuests.delete(questId);
      saveCompletedQuests();
    } else {
      inProgressQuests.delete(questId);
    }
    saveInProgressQuests();
    return Array.from(inProgressQuests);
  });

  // Get all hideout stations
  ipcMain.handle('get-all-hideout-stations', () => {
    return dataService.getAllHideoutStations();
  });

  // Get station levels
  ipcMain.handle('get-station-levels', () => {
    return stationLevels;
  });

  // Set station level
  ipcMain.handle('set-station-level', (_event, stationId: string, level: number) => {
    stationLevels[stationId] = level;
    saveStationLevels();
    return stationLevels;
  });

  // Calibration handlers
  ipcMain.handle(IPC_CHANNELS.GET_CALIBRATION, () => {
    return calibrationService.getSettings();
  });

  ipcMain.on(IPC_CHANNELS.START_CALIBRATION, () => {
    console.log('[Main] Starting calibration wizard...');
    calibrationService.startCalibration(
      calibrationSettings => {
        // Apply calibration to OCR service
        ocrService.applyCalibration(calibrationSettings);
        // Notify renderer
        mainWindow?.webContents.send(IPC_CHANNELS.CALIBRATION_UPDATE, {
          step: 'complete',
          settings: calibrationSettings,
        });
      },
      (state: CalibrationState) => {
        // Send state updates to renderer
        mainWindow?.webContents.send(IPC_CHANNELS.CALIBRATION_UPDATE, state);
      },
    );
    // Notify renderer that we're ready for capture
    mainWindow?.webContents.send(IPC_CHANNELS.CALIBRATION_UPDATE, { step: 'start' });
  });

  ipcMain.on(IPC_CHANNELS.CANCEL_CALIBRATION, () => {
    console.log('[Main] Cancelling calibration...');
    calibrationService.cancel();
  });

  ipcMain.handle(IPC_CHANNELS.CALIBRATION_CAPTURE, async () => {
    console.log('[Main] Capturing screenshot for calibration...');
    const success = await calibrationService.captureScreenshot();
    return success;
  });

  // Hotkey recording state - disable hotkeys only while recording a new hotkey
  ipcMain.on(IPC_CHANNELS.SET_HOTKEY_RECORDING, (_event, isRecording: boolean) => {
    if (isRecording) {
      console.log('[Main] Hotkey recording started - unregistering hotkeys');
      globalShortcut.unregisterAll();
    } else {
      console.log('[Main] Hotkey recording ended - re-registering hotkeys');
      registerHotkeys();
    }
  });

  // Update handlers
  ipcMain.on(IPC_CHANNELS.CHECK_FOR_UPDATES, () => {
    updateService?.checkForUpdates();
  });

  ipcMain.on(IPC_CHANNELS.DOWNLOAD_UPDATE, () => {
    updateService?.downloadUpdate();
  });

  ipcMain.on(IPC_CHANNELS.INSTALL_UPDATE, () => {
    updateService?.installUpdate();
  });

  ipcMain.on(IPC_CHANNELS.SKIP_UPDATE, (_event, version: string) => {
    updateService?.skipVersion(version);
  });

  ipcMain.handle(IPC_CHANNELS.GET_SKIPPED_VERSION, () => {
    return updateService?.getSkippedVersion() || null;
  });

  // Ping handler for testing
  ipcMain.on('ping', () => console.log('pong'));
}

/**
 * Initialize services
 */
async function initializeServices(): Promise<void> {
  console.log('[Main] Initializing services...');

  // Initialize calibration service first (stores settings)
  const configDir = app.getPath('userData');
  calibrationService = new CalibrationService(configDir);

  // Initialize data service
  dataService = new DataService(getDataPath());
  await dataService.initialize();

  // Initialize OCR service with game language
  ocrService = new OCRService();
  await ocrService.initialize(settings.gameLanguage);

  // Apply calibration if available
  if (calibrationService.isCalibrated()) {
    ocrService.applyCalibration(calibrationService.getSettings());
  }

  // Initialize search service with loaded items
  searchService = new SearchService();
  searchService.initialize(dataService.getAllItems(), settings.gameLanguage);

  console.log('[Main] All services initialized');

  // Notify renderer that data is loaded
  mainWindow?.webContents.send(IPC_CHANNELS.DATA_LOADED, dataService.getStats());
}

/**
 * App ready handler
 */

// Request single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // Handle second instance attempt - focus the existing window
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Set app user model id for Windows
    electronApp.setAppUserModelId('com.raider-scanner');

    // Setup logging first
    setupLogging();

    // Load saved settings
    loadSettings();

    // Load completed quests
    loadCompletedQuests();

    // Load in-progress quests
    loadInProgressQuests();

    // Load station levels
    loadStationLevels();

    // Watch for window shortcuts in development
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // Setup IPC before creating windows
    setupIPC();

    // Create main window
    createMainWindow();

    // Create overlay window
    createOverlayWindow();

    // Initialize services
    await initializeServices();

    // Initialize update service (only in production)
    if (!is.dev) {
      updateService = new UpdateService();
      updateService.setMainWindow(mainWindow!);
      // Check for updates after a short delay
      setTimeout(() => {
        updateService.checkForUpdates();
      }, 5000);
    }

    // Register hotkeys
    registerHotkeys();

    // macOS: Re-create window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

// Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ocrService?.terminate();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
