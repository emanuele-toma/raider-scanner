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
let debugBoxWindow: BrowserWindow | null = null;
let tooltipBoxWindow: BrowserWindow | null = null;

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
 * Show debug bounding box for the detected tooltip region
 * Shows two boxes: one for the full tooltip area (orange) and one for the OCR scan region (green)
 */
function showDebugBox(region: {
  x: number;
  y: number;
  width: number;
  height: number;
  tooltipBounds: { topmost: number; leftmost: number; bottommost: number; rightmost: number };
}): void {
  // Close existing debug boxes
  hideDebugBox();

  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;

  // Calculate the full tooltip region from tooltipBounds (in screen coordinates)
  const tooltipX = Math.floor(region.tooltipBounds.leftmost / scaleFactor);
  const tooltipY = Math.floor(region.tooltipBounds.topmost / scaleFactor);
  const tooltipWidth = Math.floor((region.tooltipBounds.rightmost - region.tooltipBounds.leftmost) / scaleFactor);
  const tooltipHeight = Math.floor((region.tooltipBounds.bottommost - region.tooltipBounds.topmost) / scaleFactor);

  // Create tooltip region box (orange - full detected color region)
  tooltipBoxWindow = new BrowserWindow({
    x: tooltipX,
    y: tooltipY,
    width: Math.max(tooltipWidth, 10),
    height: Math.max(tooltipHeight, 10),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  tooltipBoxWindow.setIgnoreMouseEvents(true, { forward: true });

  const tooltipHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
        .box {
          width: 100%;
          height: 100%;
          border: 2px dashed #ff9900;
          background: rgba(255, 153, 0, 0.05);
        }
      </style>
    </head>
    <body><div class="box"></div></body>
    </html>
  `;

  tooltipBoxWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tooltipHtml)}`);
  tooltipBoxWindow.once('ready-to-show', () => tooltipBoxWindow?.show());

  // Create OCR scan region box (green - the actual area being scanned)
  debugBoxWindow = new BrowserWindow({
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  debugBoxWindow.setIgnoreMouseEvents(true, { forward: true });

  const scanHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
        .box {
          width: 100%;
          height: 100%;
          border: 3px solid #00ff00;
          background: rgba(0, 255, 0, 0.15);
          box-shadow: 0 0 10px #00ff00, inset 0 0 10px rgba(0, 255, 0, 0.2);
        }
      </style>
    </head>
    <body><div class="box"></div></body>
    </html>
  `;

  debugBoxWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(scanHtml)}`);
  debugBoxWindow.once('ready-to-show', () => debugBoxWindow?.show());

  // Auto-hide after 2 seconds
  setTimeout(() => {
    hideDebugBox();
  }, 2000);
}

/**
 * Hide the debug bounding boxes
 */
function hideDebugBox(): void {
  if (debugBoxWindow) {
    debugBoxWindow.close();
    debugBoxWindow = null;
  }
  if (tooltipBoxWindow) {
    tooltipBoxWindow.close();
    tooltipBoxWindow = null;
  }
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
    // Perform OCR scan with callback to show bounding box immediately when region is detected
    const ocrResult = await ocrService.scan(detectedRegion => {
      // Show debug bounding box as soon as region is detected (before OCR)
      showDebugBox(detectedRegion);
    });

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
 * Register global hotkeys
 */
function registerHotkeys(): void {
  // Unregister existing hotkeys
  globalShortcut.unregisterAll();

  // Register scan hotkey
  const scanSuccess = globalShortcut.register(settings.hotkey, () => {
    console.log(`[Main] Scan hotkey pressed: ${settings.hotkey}`);
    performScan();
  });

  if (scanSuccess) {
    console.log(`[Main] Scan hotkey registered: ${settings.hotkey}`);
  } else {
    console.error(`[Main] Failed to register scan hotkey: ${settings.hotkey}`);
  }

  // Register close overlay hotkey
  const closeSuccess = globalShortcut.register(settings.closeOverlayHotkey, () => {
    console.log(`[Main] Close overlay hotkey pressed: ${settings.closeOverlayHotkey}`);
    hideOverlay();
  });

  if (closeSuccess) {
    console.log(`[Main] Close overlay hotkey registered: ${settings.closeOverlayHotkey}`);
  } else {
    console.error(`[Main] Failed to register close overlay hotkey: ${settings.closeOverlayHotkey}`);
  }

  // Register pause/resume timer hotkey
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

  // Settings panel state - disable hotkeys while settings is open (for recording new hotkeys)
  ipcMain.on(IPC_CHANNELS.SET_SETTINGS_OPEN, (_event, isOpen: boolean) => {
    if (isOpen) {
      console.log('[Main] Settings panel opened - unregistering hotkeys');
      globalShortcut.unregisterAll();
    } else {
      console.log('[Main] Settings panel closed - re-registering hotkeys');
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
app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.raider-scanner');

  // Setup logging first
  setupLogging();

  // Load saved settings
  loadSettings();

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
