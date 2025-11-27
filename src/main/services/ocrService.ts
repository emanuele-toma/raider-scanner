/**
 * OCR Service
 * Handles screen capture, image preprocessing, and text recognition
 */

import { desktopCapturer, screen } from 'electron';
import { createWorker, Worker } from 'tesseract.js';
import type { CalibrationSettings } from '../../shared/types';

// Default tooltip settings (can be overridden by calibration)
const DEFAULT_TOOLTIP_COLOR = { r: 249, g: 238, b: 223 }; // #f9eedf
const DEFAULT_COLOR_TOLERANCE = 15;
const DEFAULT_MIN_MATCHING_PIXELS = 100;

/**
 * Map game language codes to Tesseract language codes
 * Based on: https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html
 */
const GAME_TO_TESSERACT_LANG: Record<string, string> = {
  en: 'eng', // English
  de: 'deu', // German
  fr: 'fra', // French
  es: 'spa', // Spanish
  pt: 'por', // Portuguese
  pl: 'pol', // Polish
  it: 'ita', // Italian
  ru: 'rus', // Russian
  ja: 'jpn', // Japanese
  'zh-CN': 'chi_sim', // Chinese Simplified
  'zh-TW': 'chi_tra', // Chinese Traditional
  kr: 'kor', // Korean
  tr: 'tur', // Turkish
  no: 'nor', // Norwegian
  da: 'dan', // Danish
  uk: 'ukr', // Ukrainian
  hr: 'hrv', // Croatian
  sr: 'srp', // Serbian
};

/**
 * Get character whitelist based on language
 * Some languages need different character sets
 */
function getCharWhitelist(tesseractLang: string): string {
  // Base Latin characters
  const latinBase = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -'.,()[]";

  switch (tesseractLang) {
    case 'deu': // German - add umlauts and ß
      return latinBase + 'ÄÖÜäöüß';
    case 'fra': // French - add accented chars
      return latinBase + 'ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ';
    case 'spa': // Spanish - add ñ and accents
      return latinBase + 'ÁÉÍÓÚÜÑáéíóúüñ¿¡';
    case 'por': // Portuguese
      return latinBase + 'ÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú';
    case 'pol': // Polish
      return latinBase + 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż';
    case 'ita': // Italian
      return latinBase + 'ÀÈÉÌÒÙàèéìòù';
    case 'tur': // Turkish
      return latinBase + 'ÇĞİÖŞÜçğıöşü';
    case 'rus': // Russian - Cyrillic
      return 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя0123456789 -.,()[]';
    case 'ukr': // Ukrainian - Cyrillic
      return 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя0123456789 -.,()[]';
    case 'jpn': // Japanese - no whitelist, let Tesseract handle it
    case 'chi_sim': // Chinese Simplified
    case 'chi_tra': // Chinese Traditional
    case 'kor': // Korean
      return ''; // Empty means no whitelist restriction
    default:
      return latinBase;
  }
}

export interface OCRConfig {
  scanRegionSize: number; // Size of scan region around cursor
  grayscaleThreshold: number; // Threshold for binarization
  contrastEnhancement: number; // Contrast boost factor
  minMatchingPixels: number; // Minimum tooltip color pixels to detect
}

export interface CaptureResult {
  imageBuffer: Buffer;
  width: number;
  height: number;
  detectedRegion: DetectedRegion;
}

export interface TooltipBounds {
  topmost: number;
  leftmost: number;
  bottommost: number;
  rightmost: number;
  matchingPixels: number;
}

export interface TextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TooltipDetectionResult {
  bounds: TooltipBounds;
  textRegion: TextRegion;
}

export interface DetectedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  tooltipBounds: TooltipBounds;
}

export interface ScanResultWithRegion {
  text: string;
  confidence: number;
  detectedRegion: DetectedRegion;
}

export class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;
  private currentLanguage = 'eng'; // Tesseract language code
  private config: OCRConfig = {
    scanRegionSize: 400,
    grayscaleThreshold: 128,
    contrastEnhancement: 1.5,
    minMatchingPixels: DEFAULT_MIN_MATCHING_PIXELS,
  };

  // Calibration settings
  private tooltipColor = DEFAULT_TOOLTIP_COLOR;
  private colorTolerance = DEFAULT_COLOR_TOLERANCE;

  /**
   * Initialize Tesseract worker with specified language
   */
  async initialize(gameLanguage: string = 'en'): Promise<void> {
    const tesseractLang = GAME_TO_TESSERACT_LANG[gameLanguage] || 'eng';

    // If already initialized with the same language, skip
    if (this.isInitialized && this.currentLanguage === tesseractLang) {
      return;
    }

    // Terminate existing worker if switching languages
    if (this.worker) {
      console.log(`[OCRService] Switching language from ${this.currentLanguage} to ${tesseractLang}`);
      await this.terminate();
    }

    console.log(`[OCRService] Initializing Tesseract worker with language: ${tesseractLang} (game: ${gameLanguage})`);
    const startTime = Date.now();

    try {
      this.worker = await createWorker(tesseractLang, 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Progress updates during recognition
          }
        },
      });

      // Configure for game text recognition
      const charWhitelist = getCharWhitelist(tesseractLang);
      const params: Record<string, string> = {
        preserve_interword_spaces: '1',
      };

      // Only set whitelist if not empty (CJK languages need full charset)
      if (charWhitelist) {
        params.tessedit_char_whitelist = charWhitelist;
      }

      await this.worker.setParameters(params);

      this.currentLanguage = tesseractLang;
      this.isInitialized = true;
      console.log(`[OCRService] Tesseract initialized in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('[OCRService] Failed to initialize Tesseract:', error);
      throw error;
    }
  }

  /**
   * Set the game language for OCR
   * This will reinitialize the worker if the language changes
   */
  async setLanguage(gameLanguage: string): Promise<void> {
    const tesseractLang = GAME_TO_TESSERACT_LANG[gameLanguage] || 'eng';
    if (this.currentLanguage !== tesseractLang) {
      await this.initialize(gameLanguage);
    }
  }

  /**
   * Get the current Tesseract language code
   */
  getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Apply calibration settings
   */
  applyCalibration(calibration: CalibrationSettings): void {
    this.tooltipColor = calibration.tooltipColor;
    this.colorTolerance = calibration.colorTolerance;
    console.log('[OCRService] Applied calibration settings:', {
      color: this.tooltipColor,
      tolerance: this.colorTolerance,
    });
  }

  /**
   * Update OCR configuration
   */
  setConfig(config: Partial<OCRConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a pixel color matches the tooltip color within tolerance
   */
  private isTooltipColor(r: number, g: number, b: number): boolean {
    return (
      Math.abs(r - this.tooltipColor.r) <= this.colorTolerance &&
      Math.abs(g - this.tooltipColor.g) <= this.colorTolerance &&
      Math.abs(b - this.tooltipColor.b) <= this.colorTolerance
    );
  }

  /**
   * Check if a horizontal rectangle of tooltip color exists at position
   * Rectangle: 490px wide x 15px tall
   */
  private hasHorizontalBar(imageData: Buffer, width: number, height: number, startX: number, startY: number): boolean {
    const BAR_WIDTH = 490;
    const BAR_HEIGHT = 15;

    // Check bounds
    if (startX + BAR_WIDTH > width || startY + BAR_HEIGHT > height) {
      return false;
    }

    // Check all pixels in the rectangle
    for (let y = startY; y < startY + BAR_HEIGHT; y++) {
      for (let x = startX; x < startX + BAR_WIDTH; x++) {
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];

        if (!this.isTooltipColor(r, g, b)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check if a vertical rectangle of tooltip color exists at position
   * Rectangle: 25px wide x 100px tall
   */
  private hasVerticalBar(imageData: Buffer, width: number, height: number, startX: number, startY: number): boolean {
    const BAR_WIDTH = 25;
    const BAR_HEIGHT = 100;

    // Check bounds
    if (startX + BAR_WIDTH > width || startY + BAR_HEIGHT > height) {
      return false;
    }

    // Check all pixels in the rectangle
    for (let y = startY; y < startY + BAR_HEIGHT; y++) {
      for (let x = startX; x < startX + BAR_WIDTH; x++) {
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];

        if (!this.isTooltipColor(r, g, b)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Find tooltip by detecting an "L" shape pattern:
   * - Horizontal bar: 490px wide x 15px tall
   * - Vertical bar: 25px wide x 100px tall
   * Both bars share the same top-left corner.
   *
   * Once found, the text region is calculated as:
   * - Top-left: origin + (25px right, 66px down)
   * - Bottom-right: top-left + (470px right, 30px down)
   */
  private findTooltipBounds(imageData: Buffer, width: number, height: number): TooltipDetectionResult | null {
    // Text region offsets from the L-shape origin
    const TEXT_OFFSET_X = 25;
    const TEXT_OFFSET_Y = 66;
    const TEXT_WIDTH = 470;
    const TEXT_HEIGHT = 30;

    // Scan through the image looking for the L-shape pattern
    // We can skip some pixels for performance since we're looking for a large pattern
    const SCAN_STEP = 2;

    for (let y = 0; y < height - 100; y += SCAN_STEP) {
      for (let x = 0; x < width - 490; x += SCAN_STEP) {
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];

        // Quick check: is this pixel the tooltip color?
        if (!this.isTooltipColor(r, g, b)) {
          continue;
        }

        // Check for the L-shape pattern at this position
        if (
          this.hasHorizontalBar(imageData, width, height, x, y) &&
          this.hasVerticalBar(imageData, width, height, x, y)
        ) {
          console.log(`[OCRService] L-shape pattern found at: (${x}, ${y})`);

          // Calculate bounds based on the L-shape
          const bounds: TooltipBounds = {
            topmost: y,
            leftmost: x,
            bottommost: y + 100, // Vertical bar height
            rightmost: x + 490, // Horizontal bar width
            matchingPixels: 490 * 15 + 25 * 100, // Approximate pixel count
          };

          // Calculate text region
          const textRegion: TextRegion = {
            x: x + TEXT_OFFSET_X,
            y: y + TEXT_OFFSET_Y,
            width: TEXT_WIDTH,
            height: TEXT_HEIGHT,
          };

          console.log(
            `[OCRService] Text region calculated: x=${textRegion.x}, y=${textRegion.y}, w=${TEXT_WIDTH}, h=${TEXT_HEIGHT}`,
          );

          return { bounds, textRegion };
        }
      }
    }

    console.log('[OCRService] L-shape pattern not found');
    return null;
  }

  /**
   * Capture the full screen and find tooltip region
   */
  async captureTooltipRegion(): Promise<CaptureResult | null> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
      const scaleFactor = primaryDisplay.scaleFactor;

      // Get full screen capture
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.floor(screenWidth * scaleFactor),
          height: Math.floor(screenHeight * scaleFactor),
        },
      });

      if (sources.length === 0) {
        console.error('[OCRService] No screen sources available');
        return null;
      }

      const source = sources[0];
      const thumbnail = source.thumbnail;
      const fullScreenSize = thumbnail.getSize();

      // Get raw pixel data (RGBA)
      const bitmap = thumbnail.toBitmap();

      // Find tooltip bounds by L-shape pattern detection
      const detection = this.findTooltipBounds(bitmap, fullScreenSize.width, fullScreenSize.height);

      if (!detection) {
        return null;
      }

      const { bounds, textRegion } = detection;

      // Use the detected text region
      const captureX = textRegion.x;
      const captureY = textRegion.y;
      const captureWidth = textRegion.width;
      const captureHeight = textRegion.height;

      // Ensure we don't go out of bounds
      const safeX = Math.max(0, Math.min(captureX, fullScreenSize.width - captureWidth));
      const safeY = Math.max(0, Math.min(captureY, fullScreenSize.height - captureHeight));
      const safeWidth = Math.min(captureWidth, fullScreenSize.width - safeX);
      const safeHeight = Math.min(captureHeight, fullScreenSize.height - safeY);

      console.log(`[OCRService] Capturing text region: x=${safeX}, y=${safeY}, w=${safeWidth}, h=${safeHeight}`);

      // Crop to the calculated region
      const cropped = thumbnail.crop({
        x: safeX,
        y: safeY,
        width: safeWidth,
        height: safeHeight,
      });

      return {
        imageBuffer: cropped.toPNG(),
        width: Math.floor(safeWidth / scaleFactor),
        height: Math.floor(safeHeight / scaleFactor),
        detectedRegion: {
          x: Math.floor(safeX / scaleFactor),
          y: Math.floor(safeY / scaleFactor),
          width: Math.floor(safeWidth / scaleFactor),
          height: Math.floor(safeHeight / scaleFactor),
          tooltipBounds: bounds,
        },
      };
    } catch (error) {
      console.error('[OCRService] Screen capture failed:', error);
      return null;
    }
  }

  /**
   * Preprocess image for better OCR results
   * Applies grayscale, contrast enhancement, and thresholding
   */
  async preprocessImage(imageBuffer: Buffer, width: number, height: number): Promise<Buffer> {
    try {
      const sharp = await import('sharp');

      const processed = await sharp
        .default(imageBuffer)
        // Convert to grayscale
        .grayscale()
        // Increase contrast
        .normalize()
        // Apply slight sharpening
        .sharpen()
        // Resize for better OCR (2x upscale)
        .resize({
          width: width * 2,
          height: height * 2,
          fit: 'fill',
          kernel: 'lanczos3',
        })
        // Convert to PNG
        .png()
        .toBuffer();

      return processed;
    } catch (error) {
      console.warn('[OCRService] Image preprocessing failed, using original:', error);
      return imageBuffer;
    }
  }

  /**
   * Perform OCR on an image buffer
   */
  async recognize(imageBuffer: Buffer, width: number, height: number): Promise<{ text: string; confidence: number }> {
    if (!this.worker || !this.isInitialized) {
      throw new Error('OCR Service not initialized');
    }

    const startTime = Date.now();

    try {
      // Preprocess image
      const processedImage = await this.preprocessImage(imageBuffer, width, height);

      // Perform recognition
      const result = await this.worker.recognize(processedImage);

      console.log(`[OCRService] Recognition completed in ${Date.now() - startTime}ms`);
      console.log(`[OCRService] Confidence: ${result.data.confidence}%`);
      console.log(`[OCRService] Raw text: "${result.data.text.trim()}"`);

      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
    } catch (error) {
      console.error('[OCRService] Recognition failed:', error);
      throw error;
    }
  }

  /**
   * Detect tooltip region only (without OCR)
   * Useful for showing bounding box before OCR processing
   */
  async detectTooltipRegion(): Promise<DetectedRegion | null> {
    const capture = await this.captureTooltipRegion();
    if (!capture) {
      return null;
    }
    return capture.detectedRegion;
  }

  /**
   * Full scan pipeline: detect tooltip by color, capture region, preprocess, recognize
   * Optionally accepts a callback to be called with the detected region before OCR
   */
  async scan(onRegionDetected?: (region: DetectedRegion) => void): Promise<ScanResultWithRegion | null> {
    // Capture tooltip region by detecting the tooltip color
    const capture = await this.captureTooltipRegion();
    if (!capture) {
      return null;
    }

    // Call the callback with detected region (for showing bounding box)
    if (onRegionDetected) {
      onRegionDetected(capture.detectedRegion);
    }

    // Perform OCR
    const ocrResult = await this.recognize(capture.imageBuffer, capture.width, capture.height);

    return {
      ...ocrResult,
      detectedRegion: capture.detectedRegion,
    };
  }

  /**
   * Cleanup resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      console.log('[OCRService] Worker terminated');
    }
  }

  /**
   * Check if service is ready
   */
  get ready(): boolean {
    return this.isInitialized && this.worker !== null;
  }
}
