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

  // Corner L-shape dimensions (thin borders)
  private readonly L_WIDTH = 2; // Width of the L-shape lines
  private readonly L_LENGTH = 100; // Length of each L segment

  /**
   * Check for Top-Left corner L-shape: ┌
   * Horizontal segment goes right, vertical segment goes down
   */
  private hasTopLeftCorner(imageData: Buffer, width: number, height: number, x: number, y: number): boolean {
    // Check bounds
    if (x + this.L_LENGTH > width || y + this.L_LENGTH > height) return false;

    // Check horizontal segment (going right)
    for (let dx = 0; dx < this.L_LENGTH; dx++) {
      for (let dy = 0; dy < this.L_WIDTH; dy++) {
        const idx = ((y + dy) * width + (x + dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    // Check vertical segment (going down)
    for (let dy = 0; dy < this.L_LENGTH; dy++) {
      for (let dx = 0; dx < this.L_WIDTH; dx++) {
        const idx = ((y + dy) * width + (x + dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check for Top-Right corner L-shape: ┐
   * Horizontal segment goes left, vertical segment goes down
   */
  private hasTopRightCorner(imageData: Buffer, width: number, height: number, x: number, y: number): boolean {
    // Check bounds (x is the right edge)
    if (x - this.L_LENGTH < 0 || y + this.L_LENGTH > height) return false;

    // Check horizontal segment (going left from x)
    for (let dx = 0; dx < this.L_LENGTH; dx++) {
      for (let dy = 0; dy < this.L_WIDTH; dy++) {
        const idx = ((y + dy) * width + (x - dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    // Check vertical segment (going down from top-right)
    for (let dy = 0; dy < this.L_LENGTH; dy++) {
      for (let dx = 0; dx < this.L_WIDTH; dx++) {
        const idx = ((y + dy) * width + (x - dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check for Bottom-Left corner L-shape: └
   * Horizontal segment goes right, vertical segment goes up
   */
  private hasBottomLeftCorner(imageData: Buffer, width: number, _height: number, x: number, y: number): boolean {
    // Check bounds (y is the bottom edge)
    if (x + this.L_LENGTH > width || y - this.L_LENGTH < 0) return false;

    // Check horizontal segment (going right)
    for (let dx = 0; dx < this.L_LENGTH; dx++) {
      for (let dy = 0; dy < this.L_WIDTH; dy++) {
        const idx = ((y - dy) * width + (x + dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    // Check vertical segment (going up)
    for (let dy = 0; dy < this.L_LENGTH; dy++) {
      for (let dx = 0; dx < this.L_WIDTH; dx++) {
        const idx = ((y - dy) * width + (x + dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check for Bottom-Right corner L-shape: ┘
   * Horizontal segment goes left, vertical segment goes up
   */
  private hasBottomRightCorner(imageData: Buffer, width: number, _height: number, x: number, y: number): boolean {
    // Check bounds (x is right edge, y is bottom edge)
    if (x - this.L_LENGTH < 0 || y - this.L_LENGTH < 0) return false;

    // Check horizontal segment (going left)
    for (let dx = 0; dx < this.L_LENGTH; dx++) {
      for (let dy = 0; dy < this.L_WIDTH; dy++) {
        const idx = ((y - dy) * width + (x - dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    // Check vertical segment (going up)
    for (let dy = 0; dy < this.L_LENGTH; dy++) {
      for (let dx = 0; dx < this.L_WIDTH; dx++) {
        const idx = ((y - dy) * width + (x - dx)) * 4;
        if (!this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Find all four corners of the tooltip frame
   * Returns the bounding rectangle if all corners are found
   */
  private findTooltipCorners(
    imageData: Buffer,
    width: number,
    height: number,
  ): { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } } | null {
    const SCAN_STEP = 4; // Scan every 4 pixels for performance
    const corners: {
      topLeft?: { x: number; y: number };
      topRight?: { x: number; y: number };
      bottomLeft?: { x: number; y: number };
      bottomRight?: { x: number; y: number };
    } = {};

    // Scan for top-left corner (start from top-left of screen)
    outerTL: for (let y = 0; y < height - this.L_LENGTH; y += SCAN_STEP) {
      for (let x = 0; x < width - this.L_LENGTH; x += SCAN_STEP) {
        const idx = (y * width + x) * 4;
        if (this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          if (this.hasTopLeftCorner(imageData, width, height, x, y)) {
            corners.topLeft = { x, y };
            console.log(`[OCRService] Found top-left corner at (${x}, ${y})`);
            break outerTL;
          }
        }
      }
    }

    if (!corners.topLeft) {
      console.log('[OCRService] Top-left corner not found');
      return null;
    }

    // Scan for top-right corner (start from top-right, moving left and down from top-left's Y)
    outerTR: for (
      let y = corners.topLeft.y;
      y < Math.min(corners.topLeft.y + 50, height - this.L_LENGTH);
      y += SCAN_STEP
    ) {
      for (let x = width - 1; x > corners.topLeft.x + this.L_LENGTH; x -= SCAN_STEP) {
        const idx = (y * width + x) * 4;
        if (this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          if (this.hasTopRightCorner(imageData, width, height, x, y)) {
            corners.topRight = { x, y };
            console.log(`[OCRService] Found top-right corner at (${x}, ${y})`);
            break outerTR;
          }
        }
      }
    }

    if (!corners.topRight) {
      console.log('[OCRService] Top-right corner not found');
      return null;
    }

    // Scan for bottom-left corner (start from bottom, around top-left's X)
    outerBL: for (let y = height - 1; y > corners.topLeft.y + this.L_LENGTH; y -= SCAN_STEP) {
      for (let x = corners.topLeft.x; x < Math.min(corners.topLeft.x + 50, width - this.L_LENGTH); x += SCAN_STEP) {
        const idx = (y * width + x) * 4;
        if (this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          if (this.hasBottomLeftCorner(imageData, width, height, x, y)) {
            corners.bottomLeft = { x, y };
            console.log(`[OCRService] Found bottom-left corner at (${x}, ${y})`);
            break outerBL;
          }
        }
      }
    }

    if (!corners.bottomLeft) {
      console.log('[OCRService] Bottom-left corner not found');
      return null;
    }

    // Scan for bottom-right corner (around bottom-left's Y and top-right's X)
    outerBR: for (let y = corners.bottomLeft.y; y > corners.bottomLeft.y - 50 && y > this.L_LENGTH; y -= SCAN_STEP) {
      for (let x = corners.topRight.x; x > corners.topRight.x - 50 && x > this.L_LENGTH; x -= SCAN_STEP) {
        const idx = (y * width + x) * 4;
        if (this.isTooltipColor(imageData[idx], imageData[idx + 1], imageData[idx + 2])) {
          if (this.hasBottomRightCorner(imageData, width, height, x, y)) {
            corners.bottomRight = { x, y };
            console.log(`[OCRService] Found bottom-right corner at (${x}, ${y})`);
            break outerBR;
          }
        }
      }
    }

    if (!corners.bottomRight) {
      console.log('[OCRService] Bottom-right corner not found');
      return null;
    }

    console.log('[OCRService] All four corners found!');
    return {
      topLeft: corners.topLeft,
      bottomRight: corners.bottomRight,
    };
  }

  /**
   * Find tooltip by detecting four corner L-shapes
   * Each corner is an L with 2px width and 100px length segments
   */
  private findTooltipBounds(imageData: Buffer, width: number, height: number): TooltipDetectionResult | null {
    const corners = this.findTooltipCorners(imageData, width, height);

    if (!corners) {
      return null;
    }

    const { topLeft, bottomRight } = corners;

    // Calculate padding inside the frame (skip the border)
    const PADDING = 10;

    const bounds: TooltipBounds = {
      topmost: topLeft.y,
      leftmost: topLeft.x,
      bottommost: bottomRight.y,
      rightmost: bottomRight.x,
      matchingPixels: 0,
    };

    // The entire interior region is the text area
    const textRegion: TextRegion = {
      x: topLeft.x + PADDING,
      y: topLeft.y + PADDING,
      width: bottomRight.x - topLeft.x - PADDING * 2,
      height: bottomRight.y - topLeft.y - PADDING * 2,
    };

    console.log(
      `[OCRService] Tooltip region: x=${textRegion.x}, y=${textRegion.y}, w=${textRegion.width}, h=${textRegion.height}`,
    );

    return { bounds, textRegion };
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
   * Perform OCR on an image buffer and return text with largest font size
   */
  async recognize(imageBuffer: Buffer, width: number, height: number): Promise<{ text: string; confidence: number }> {
    if (!this.worker || !this.isInitialized) {
      throw new Error('OCR Service not initialized');
    }

    const startTime = Date.now();

    try {
      // Preprocess image
      const processedImage = await this.preprocessImage(imageBuffer, width, height);

      // Perform recognition with word-level data
      const result = await this.worker.recognize(processedImage, undefined, {
        blocks: true,
        text: true,
        layoutBlocks: true,
      });

      console.log(`[OCRService] Recognition completed in ${Date.now() - startTime}ms`);
      console.log(`[OCRService] Full text: "${result.data.text.trim()}"`);

      // Navigate the Tesseract structure: blocks -> paragraphs -> lines -> words
      const data = result.data;
      const blocks = data.blocks || [];

      console.log(`[OCRService] Found ${blocks.length} blocks`);

      if (blocks.length === 0) {
        console.log('[OCRService] No blocks detected, using full text');
        return { text: result.data.text.trim(), confidence: result.data.confidence };
      }

      // Collect all lines with font size calculated from word heights (more accurate than line bbox)
      interface LineWithSize {
        text: string;
        confidence: number;
        fontSize: number; // Average word height (actual font size)
        y: number; // vertical position
      }

      const allLines: LineWithSize[] = [];

      for (const block of blocks) {
        const paragraphs = block.paragraphs || [];
        for (const paragraph of paragraphs) {
          const lines = paragraph.lines || [];
          for (const line of lines) {
            const words = line.words || [];
            const lineText = line.text?.trim() || '';
            const lineY = line.bbox.y0;

            if (lineText.length > 0 && words.length > 0) {
              // Calculate average word height as font size proxy
              // This is more accurate than line bbox which includes spacing
              const wordHeights = words.map((w: { bbox: { y1: number; y0: number } }) => w.bbox.y1 - w.bbox.y0);
              const avgWordHeight = wordHeights.reduce((a: number, b: number) => a + b, 0) / wordHeights.length;

              allLines.push({
                text: lineText,
                confidence: line.confidence || 0,
                fontSize: avgWordHeight,
                y: lineY,
              });

              console.log(`[OCRService] Line: "${lineText}" avgWordHeight=${avgWordHeight.toFixed(1)}px y=${lineY}`);
            }
          }
        }
      }

      console.log(`[OCRService] Found ${allLines.length} lines total`);

      if (allLines.length === 0) {
        return { text: result.data.text.trim(), confidence: result.data.confidence };
      }

      // Sort all lines by Y position
      const sortedByY = [...allLines].sort((a, b) => a.y - b.y);

      // Only consider the first half of lines (title is always at the top)
      const halfIndex = Math.ceil(sortedByY.length / 2);
      const topHalfLines = sortedByY.slice(0, halfIndex);

      console.log(`[OCRService] Considering only first ${halfIndex} of ${allLines.length} lines`);

      // Find the line with the largest font size in the top half
      const sortedByFontSize = [...topHalfLines].sort((a, b) => b.fontSize - a.fontSize);
      const maxFontSize = sortedByFontSize[0].fontSize;
      const largestLine = sortedByFontSize[0];

      // Find the index of the largest line in Y-sorted array
      const largestLineIndex = topHalfLines.findIndex(l => l === largestLine);

      // Collect consecutive lines with the exact same font size (rounded to nearest pixel)
      const roundedMaxFontSize = Math.round(maxFontSize);
      const titleLines: typeof allLines = [largestLine];

      // Check lines immediately after the largest line
      for (let i = largestLineIndex + 1; i < topHalfLines.length; i++) {
        const nextLine = topHalfLines[i];
        const roundedNextFontSize = Math.round(nextLine.fontSize);

        if (roundedNextFontSize === roundedMaxFontSize) {
          titleLines.push(nextLine);
        } else {
          break; // Stop at first line with different font size
        }
      }

      // Sort title lines by Y position and combine
      titleLines.sort((a, b) => a.y - b.y);
      const titleText = titleLines.map(l => l.text).join(' ');
      const avgConfidence = titleLines.reduce((sum, l) => sum + l.confidence, 0) / titleLines.length;

      console.log(`[OCRService] Max font size: ${maxFontSize.toFixed(1)}px (rounded: ${roundedMaxFontSize}px)`);
      console.log(`[OCRService] Title lines (${titleLines.length}): "${titleText}"`);

      return {
        text: titleText.trim(),
        confidence: avgConfidence,
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
