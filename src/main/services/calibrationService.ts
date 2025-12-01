/**
 * Calibration Service
 * Handles tooltip calibration wizard for OCR region detection
 *
 * Flow:
 * 1. User opens a tooltip in-game and presses "Capture"
 * 2. Screenshot is taken and displayed fullscreen
 * 3. User clicks on the screenshot to pick: color, text top-left, text bottom-right
 * 4. Calibration settings are saved
 */

import { BrowserWindow, desktopCapturer, globalShortcut, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CalibrationSettings, CalibrationState, CalibrationStep } from '../../shared/types';

// Default calibration settings (based on ARC Raiders defaults)
const DEFAULT_CALIBRATION: CalibrationSettings = {
  tooltipColor: { r: 249, g: 238, b: 223 }, // #f9eedf
  colorTolerance: 15,
  isCalibrated: false,
};

export class CalibrationService {
  private screenshotWindow: BrowserWindow | null = null;
  private settings: CalibrationSettings;
  private state: CalibrationState = { step: 'start' };
  private configPath: string;
  private screenshotDataUrl: string | null = null;
  private screenshotBitmap: Buffer | null = null;
  private screenshotSize: { width: number; height: number } | null = null;
  private scaleFactor: number = 1;
  private onComplete?: (settings: CalibrationSettings) => void;
  private onUpdate?: (state: CalibrationState) => void;

  constructor(configDir: string) {
    this.configPath = join(configDir, 'calibration.json');
    this.settings = this.loadSettings();
  }

  /**
   * Load calibration settings from disk
   */
  private loadSettings(): CalibrationSettings {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data) as CalibrationSettings;
        console.log('[CalibrationService] Loaded calibration settings');
        return { ...DEFAULT_CALIBRATION, ...loaded };
      }
    } catch (error) {
      console.error('[CalibrationService] Failed to load calibration settings:', error);
    }
    return { ...DEFAULT_CALIBRATION };
  }

  /**
   * Save calibration settings to disk
   */
  private saveSettings(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2));
      console.log('[CalibrationService] Saved calibration settings');
    } catch (error) {
      console.error('[CalibrationService] Failed to save calibration settings:', error);
    }
  }

  /**
   * Get current calibration settings
   */
  getSettings(): CalibrationSettings {
    return { ...this.settings };
  }

  /**
   * Get current calibration state
   */
  getState(): CalibrationState {
    return { ...this.state };
  }

  /**
   * Check if calibration is complete
   */
  isCalibrated(): boolean {
    return this.settings.isCalibrated;
  }

  /**
   * Start calibration wizard
   */
  startCalibration(
    onComplete: (settings: CalibrationSettings) => void,
    onUpdate: (state: CalibrationState) => void,
  ): void {
    this.onComplete = onComplete;
    this.onUpdate = onUpdate;
    this.state = { step: 'start' };
    this.screenshotDataUrl = null;
    this.screenshotBitmap = null;
    this.screenshotSize = null;
    this.notifyUpdate();

    // Register hotkey for screenshot capture
    this.registerCaptureHotkey();
  }

  /**
   * Register global hotkey for capturing screenshot
   */
  private registerCaptureHotkey(): void {
    // Unregister first in case it's already registered
    globalShortcut.unregister('CommandOrControl+P');

    globalShortcut.register('CommandOrControl+P', () => {
      if (this.state.step === 'start') {
        console.log('[CalibrationService] Ctrl+P pressed - capturing screenshot');
        this.captureScreenshot();
      }
    });

    console.log('[CalibrationService] Press Ctrl+P to capture screenshot');
  }

  /**
   * Unregister capture hotkey
   */
  private unregisterCaptureHotkey(): void {
    globalShortcut.unregister('CommandOrControl+P');
  }

  /**
   * Capture screenshot and move to picking phase
   */
  async captureScreenshot(): Promise<boolean> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
      this.scaleFactor = primaryDisplay.scaleFactor;

      // Capture screen
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.floor(screenWidth * this.scaleFactor),
          height: Math.floor(screenHeight * this.scaleFactor),
        },
      });

      if (sources.length === 0) {
        console.error('[CalibrationService] No screen sources available');
        return false;
      }

      const thumbnail = sources[0].thumbnail;
      this.screenshotBitmap = thumbnail.toBitmap();
      this.screenshotSize = thumbnail.getSize();
      this.screenshotDataUrl = thumbnail.toDataURL();

      console.log('[CalibrationService] Screenshot captured:', this.screenshotSize);

      // Move to pick-color step and show screenshot window
      this.state.step = 'pick-color';
      this.notifyUpdate();
      this.showScreenshotWindow();

      return true;
    } catch (error) {
      console.error('[CalibrationService] Failed to capture screenshot:', error);
      return false;
    }
  }

  /**
   * Move to next calibration step
   */
  nextStep(): void {
    const steps: CalibrationStep[] = ['start', 'pick-color', 'complete'];
    const currentIndex = steps.indexOf(this.state.step);
    if (currentIndex < steps.length - 1) {
      this.state.step = steps[currentIndex + 1];
      this.notifyUpdate();

      // Complete calibration
      if (this.state.step === 'complete') {
        this.completeCalibration();
      }
    }
  }

  /**
   * Handle a pick action at given position on the screenshot
   */
  pickAtPosition(x: number, y: number): void {
    // Scale position to match the screenshot bitmap coordinates
    const scaledX = Math.floor(x * this.scaleFactor);
    const scaledY = Math.floor(y * this.scaleFactor);

    if (this.state.step === 'pick-color') {
      this.pickColorAtPosition(scaledX, scaledY);
    }
  }

  /**
   * Pick color at position on screenshot bitmap
   */
  private pickColorAtPosition(x: number, y: number): void {
    if (!this.screenshotBitmap || !this.screenshotSize) {
      console.error('[CalibrationService] No screenshot available');
      return;
    }

    // Ensure we're within bounds
    if (x >= 0 && x < this.screenshotSize.width && y >= 0 && y < this.screenshotSize.height) {
      const idx = (y * this.screenshotSize.width + x) * 4;
      const r = this.screenshotBitmap[idx];
      const g = this.screenshotBitmap[idx + 1];
      const b = this.screenshotBitmap[idx + 2];

      this.state.tooltipColor = { r, g, b };
      console.log(`[CalibrationService] Picked color: rgb(${r}, ${g}, ${b})`);

      this.nextStep();
    }
  }

  /**
   * Legacy pick method - now handled by pickAtPosition
   */
  async pick(): Promise<void> {
    // This is now handled by pickAtPosition called from the screenshot window
    console.warn('[CalibrationService] pick() called but should use pickAtPosition()');
  }

  /**
   * Complete calibration and save settings
   */
  private completeCalibration(): void {
    if (!this.state.tooltipColor) {
      console.error('[CalibrationService] No color picked');
      return;
    }

    this.settings = {
      tooltipColor: this.state.tooltipColor,
      colorTolerance: 15,
      isCalibrated: true,
    };

    console.log('[CalibrationService] Calibration complete:', this.settings);

    this.saveSettings();
    this.hideScreenshotWindow();
    this.unregisterCaptureHotkey();

    if (this.onComplete) {
      this.onComplete(this.settings);
    }
  }

  /**
   * Cancel calibration
   */
  cancel(): void {
    // If we're in pick-color step, go back to start step but keep hotkey registered
    // so user can press Ctrl+P again to retry
    const wasPickingColor = this.state.step === 'pick-color';

    this.state = { step: 'start' };
    this.hideScreenshotWindow();
    this.screenshotDataUrl = null;
    this.screenshotBitmap = null;
    this.screenshotSize = null;

    if (wasPickingColor) {
      // Keep hotkey registered so user can retry with Ctrl+P
      // Re-register to ensure it's active
      this.registerCaptureHotkey();
    } else {
      this.unregisterCaptureHotkey();
    }

    this.notifyUpdate();
  }

  /**
   * Reset calibration to defaults
   */
  reset(): void {
    this.settings = { ...DEFAULT_CALIBRATION };
    this.saveSettings();
  }

  /**
   * Show fullscreen screenshot window for picking
   */
  private showScreenshotWindow(): void {
    if (this.screenshotWindow) {
      this.screenshotWindow.close();
    }

    if (!this.screenshotDataUrl) {
      console.error('[CalibrationService] No screenshot available');
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    this.screenshotWindow = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      show: false,
      frame: false,
      fullscreen: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const stepText = this.getStepInstruction();

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@400;500;600&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          :root {
            --cyan: #00ffff;
            --pink: #ff00ff;
            --purple: #a855f7;
            --success: #00ff88;
            --bg-dark: rgba(10, 5, 18, 0.95);
            --bg-card: rgba(26, 10, 46, 0.98);
          }
          
          html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            cursor: none;
            font-family: 'Rajdhani', sans-serif;
          }
          
          .screenshot {
            width: 100%;
            height: 100%;
            object-fit: cover;
            filter: brightness(0.85);
          }
          
          /* Vignette overlay */
          .vignette {
            position: fixed;
            inset: 0;
            background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%);
            pointer-events: none;
            z-index: 1;
          }
          
          /* Top instruction panel */
          .instruction-panel {
            position: fixed;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-card);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 16px;
            padding: 24px 40px;
            z-index: 1000;
            pointer-events: none;
            backdrop-filter: blur(20px);
            box-shadow: 
              0 0 40px rgba(0, 255, 255, 0.15),
              0 20px 60px rgba(0, 0, 0, 0.5),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
          }
          
          .instruction-panel::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--cyan), transparent);
          }
          
          .instruction-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
          }
          
          .instruction-icon {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, rgba(255, 0, 255, 0.2), rgba(0, 255, 255, 0.1));
            border: 2px solid var(--pink);
            border-radius: 12px;
            box-shadow: 0 0 20px rgba(255, 0, 255, 0.3);
            animation: pulse-icon 2s ease-in-out infinite;
          }
          
          @keyframes pulse-icon {
            0%, 100% { box-shadow: 0 0 20px rgba(255, 0, 255, 0.3); }
            50% { box-shadow: 0 0 35px rgba(255, 0, 255, 0.5); }
          }
          
          .instruction-icon svg {
            width: 28px;
            height: 28px;
            color: var(--pink);
            filter: drop-shadow(0 0 8px var(--pink));
          }
          
          .instruction-content h2 {
            font-family: 'Orbitron', sans-serif;
            font-size: 20px;
            font-weight: 600;
            color: var(--cyan);
            text-transform: uppercase;
            letter-spacing: 2px;
            text-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
            margin-bottom: 4px;
          }
          
          .instruction-content p {
            font-size: 15px;
            color: rgba(255, 255, 255, 0.7);
          }
          
          .instruction-hint {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            padding-top: 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            margin-top: 16px;
          }
          
          .hint-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
          }
          
          .hint-key {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 4px 10px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            font-family: 'Share Tech Mono', monospace;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.8);
          }
          
          /* Custom crosshair cursor */
          .crosshair {
            position: fixed;
            pointer-events: none;
            z-index: 999;
          }
          
          .crosshair-center {
            position: fixed;
            width: 20px;
            height: 20px;
            border: 2px solid var(--cyan);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 
              0 0 15px var(--cyan),
              inset 0 0 10px rgba(0, 255, 255, 0.2);
            animation: crosshair-pulse 1.5s ease-in-out infinite;
          }
          
          @keyframes crosshair-pulse {
            0%, 100% { 
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            50% { 
              transform: translate(-50%, -50%) scale(1.1);
              opacity: 0.8;
            }
          }
          
          .crosshair-dot {
            position: fixed;
            width: 4px;
            height: 4px;
            background: var(--cyan);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 10px var(--cyan);
          }
          
          .crosshair-h, .crosshair-v {
            position: fixed;
            pointer-events: none;
            z-index: 998;
          }
          
          .crosshair-h {
            width: 100%;
            height: 1px;
            left: 0;
            background: linear-gradient(90deg, 
              transparent 0%, 
              rgba(0, 255, 255, 0.1) 20%,
              rgba(0, 255, 255, 0.4) 45%,
              transparent 50%,
              rgba(0, 255, 255, 0.4) 55%,
              rgba(0, 255, 255, 0.1) 80%,
              transparent 100%
            );
          }
          
          .crosshair-v {
            width: 1px;
            height: 100%;
            top: 0;
            background: linear-gradient(180deg, 
              transparent 0%, 
              rgba(0, 255, 255, 0.1) 20%,
              rgba(0, 255, 255, 0.4) 45%,
              transparent 50%,
              rgba(0, 255, 255, 0.4) 55%,
              rgba(0, 255, 255, 0.1) 80%,
              transparent 100%
            );
          }
          
          /* Color preview panel */
          .color-panel {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-card);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 16px;
            padding: 20px 32px;
            display: flex;
            align-items: center;
            gap: 24px;
            z-index: 1000;
            pointer-events: none;
            backdrop-filter: blur(20px);
            box-shadow: 
              0 0 40px rgba(0, 255, 255, 0.15),
              0 20px 60px rgba(0, 0, 0, 0.5);
          }
          
          .color-swatch-container {
            position: relative;
          }
          
          .color-swatch {
            width: 64px;
            height: 64px;
            border-radius: 12px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            box-shadow: 
              0 4px 20px rgba(0, 0, 0, 0.4),
              inset 0 2px 0 rgba(255, 255, 255, 0.1);
            position: relative;
            overflow: hidden;
          }
          
          .color-swatch::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 50%;
            background: linear-gradient(180deg, rgba(255,255,255,0.15), transparent);
            border-radius: 9px 9px 0 0;
          }
          
          .color-ring {
            position: absolute;
            inset: -4px;
            border: 2px solid var(--cyan);
            border-radius: 16px;
            opacity: 0.5;
            animation: color-ring-rotate 3s linear infinite;
          }
          
          @keyframes color-ring-rotate {
            0% { border-color: var(--cyan); }
            33% { border-color: var(--pink); }
            66% { border-color: var(--purple); }
            100% { border-color: var(--cyan); }
          }
          
          .color-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          
          .color-label {
            font-size: 11px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1.5px;
          }
          
          .color-hex {
            font-family: 'Share Tech Mono', monospace;
            font-size: 24px;
            font-weight: 700;
            color: var(--cyan);
            text-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
          }
          
          .color-rgb {
            font-family: 'Share Tech Mono', monospace;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
          }
          
          .click-hint {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding-left: 24px;
            border-left: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .click-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 200, 100, 0.05));
            border: 2px solid var(--success);
            border-radius: 10px;
            animation: click-bounce 2s ease-in-out infinite;
          }
          
          @keyframes click-bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
          
          .click-icon svg {
            width: 22px;
            height: 22px;
            color: var(--success);
            filter: drop-shadow(0 0 6px var(--success));
          }
          
          .click-text {
            font-size: 12px;
            color: var(--success);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          /* Scanline effect */
          .scanlines {
            position: fixed;
            inset: 0;
            background: repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 255, 0.015) 2px,
              rgba(0, 255, 255, 0.015) 4px
            );
            pointer-events: none;
            z-index: 2;
          }
        </style>
      </head>
      <body>
        <img class="screenshot" src="${this.screenshotDataUrl}" />
        <div class="vignette"></div>
        <div class="scanlines"></div>
        
        <div class="instruction-panel">
          <div class="instruction-header">
            <div class="instruction-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 6v2m0 8v2m-6-6h2m8 0h2"/>
              </svg>
            </div>
            <div class="instruction-content">
              <h2>${stepText}</h2>
              <p>Click anywhere on the tooltip background to select the color</p>
            </div>
          </div>
          <div class="instruction-hint">
            <div class="hint-item">
              <span class="hint-key">Click</span>
              <span>Select color</span>
            </div>
            <div class="hint-item">
              <span class="hint-key">ESC</span>
              <span>Cancel calibration</span>
            </div>
          </div>
        </div>
        
        <div class="crosshair-center" id="crosshair-center"></div>
        <div class="crosshair-dot" id="crosshair-dot"></div>
        <div class="crosshair-h" id="crosshair-h"></div>
        <div class="crosshair-v" id="crosshair-v"></div>
        
        <div class="color-panel">
          <div class="color-swatch-container">
            <div class="color-swatch" id="color-swatch"></div>
            <div class="color-ring"></div>
          </div>
          <div class="color-info">
            <span class="color-label">Current Color</span>
            <span class="color-hex" id="color-hex">#------</span>
            <span class="color-rgb" id="color-rgb">RGB: --, --, --</span>
          </div>
          <div class="click-hint">
            <div class="click-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
              </svg>
            </div>
            <span class="click-text">Click to select</span>
          </div>
        </div>
        
        <script>
          const crosshairCenter = document.getElementById('crosshair-center');
          const crosshairDot = document.getElementById('crosshair-dot');
          const crosshairH = document.getElementById('crosshair-h');
          const crosshairV = document.getElementById('crosshair-v');
          const colorSwatch = document.getElementById('color-swatch');
          const colorHex = document.getElementById('color-hex');
          const colorRgb = document.getElementById('color-rgb');
          const screenshot = document.querySelector('.screenshot');
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let imageLoaded = false;
          
          screenshot.onload = () => {
            canvas.width = screenshot.naturalWidth;
            canvas.height = screenshot.naturalHeight;
            ctx.drawImage(screenshot, 0, 0);
            imageLoaded = true;
          };
          
          function toHex(n) {
            return n.toString(16).padStart(2, '0').toUpperCase();
          }
          
          document.addEventListener('mousemove', (e) => {
            crosshairCenter.style.left = e.clientX + 'px';
            crosshairCenter.style.top = e.clientY + 'px';
            crosshairDot.style.left = e.clientX + 'px';
            crosshairDot.style.top = e.clientY + 'px';
            crosshairH.style.top = e.clientY + 'px';
            crosshairV.style.left = e.clientX + 'px';
            
            if (imageLoaded) {
              const scaleX = canvas.width / window.innerWidth;
              const scaleY = canvas.height / window.innerHeight;
              const x = Math.floor(e.clientX * scaleX);
              const y = Math.floor(e.clientY * scaleY);
              
              if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                const pixel = ctx.getImageData(x, y, 1, 1).data;
                const r = pixel[0], g = pixel[1], b = pixel[2];
                const hex = '#' + toHex(r) + toHex(g) + toHex(b);
                
                colorSwatch.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
                colorHex.textContent = hex;
                colorRgb.textContent = 'RGB: ' + r + ', ' + g + ', ' + b;
              }
            }
          });
          
          document.addEventListener('click', (e) => {
            document.title = 'PICK:' + e.clientX + ':' + e.clientY;
          });
          
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              document.title = 'CANCEL';
            }
          });
        </script>
      </body>
      </html>
    `;

    this.screenshotWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Listen for title changes to get pick/cancel events
    this.screenshotWindow.on('page-title-updated', (_event, title) => {
      if (title.startsWith('PICK:')) {
        const parts = title.split(':');
        const x = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        this.pickAtPosition(x, y);

        // Update the instruction for next step if window still exists
        if (this.screenshotWindow && this.state.step !== 'complete') {
          this.updateScreenshotInstruction();
        }
      } else if (title === 'CANCEL') {
        this.cancel();
      }
    });

    this.screenshotWindow.once('ready-to-show', () => {
      this.screenshotWindow?.show();
    });

    this.screenshotWindow.on('closed', () => {
      this.screenshotWindow = null;
    });
  }

  /**
   * Update instruction in screenshot window
   */
  private updateScreenshotInstruction(): void {
    if (!this.screenshotWindow) return;

    const stepText = this.getStepInstruction();

    this.screenshotWindow.webContents.executeJavaScript(`
      document.querySelector('.instruction-content h2').textContent = '${stepText}';
    `);
  }

  /**
   * Hide screenshot window
   */
  private hideScreenshotWindow(): void {
    if (this.screenshotWindow) {
      this.screenshotWindow.close();
      this.screenshotWindow = null;
    }
  }

  /**
   * Get instruction text for current step
   */
  private getStepInstruction(): string {
    if (this.state.step === 'pick-color') {
      return 'Select Tooltip Color';
    }
    return '';
  }

  /**
   * Notify update callback
   */
  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate({ ...this.state });
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.hideScreenshotWindow();
    this.unregisterCaptureHotkey();
  }
}
