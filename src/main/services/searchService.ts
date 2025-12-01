/**
 * Search Service
 * Fuzzy matching for item names using Fuse.js
 */

import Fuse from 'fuse.js';
import type { EnrichedItem } from '../../shared/types';

export interface SearchResult {
  item: EnrichedItem;
  score: number;
  matches?: ReadonlyArray<{
    key?: string;
    value?: string;
    indices: ReadonlyArray<[number, number]>;
  }>;
}

export class SearchService {
  private fuse: Fuse<EnrichedItem> | null = null;
  private items: EnrichedItem[] = [];
  private currentLanguage: string = 'en';

  /**
   * Initialize search index with items
   */
  initialize(items: EnrichedItem[], language: string = 'en'): void {
    this.items = items;
    this.currentLanguage = language;
    this.rebuildIndex();
    console.log(`[SearchService] Indexed ${items.length} items for search in language: ${language}`);
  }

  /**
   * Set the game language and rebuild the search index
   */
  setLanguage(language: string): void {
    if (this.currentLanguage !== language) {
      this.currentLanguage = language;
      this.rebuildIndex();
      console.log(`[SearchService] Rebuilt index for language: ${language}`);
    }
  }

  /**
   * Rebuild the Fuse.js index with current language
   */
  private rebuildIndex(): void {
    // Configure Fuse.js for game item name matching
    // Optimized for OCR inaccuracies (typos, missing letters)
    this.fuse = new Fuse(this.items, {
      keys: [
        { name: `name.${this.currentLanguage}`, weight: 1.0 },
        { name: 'name.en', weight: 0.5 }, // Fallback to English
        { name: 'id', weight: 0.3 },
        { name: 'type', weight: 0.2 },
      ],
      threshold: 0.4, // Allow for OCR errors
      distance: 100,
      minMatchCharLength: 3,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true, // Don't penalize matches not at the start
      useExtendedSearch: true,
    });
  }

  /**
   * Search for items matching the query
   * Prioritizes exact matches over fuzzy matches
   */
  search(query: string, limit = 5): SearchResult[] {
    if (!this.fuse || !query.trim()) {
      return [];
    }

    // Clean the query
    const cleanQuery = this.cleanOCRText(query);
    console.log(`[SearchService] Searching for: "${cleanQuery}"`);

    // First, check for exact match (case insensitive)
    const exactMatch = this.exactMatch(cleanQuery);
    if (exactMatch) {
      console.log(`[SearchService] Found exact match: "${exactMatch.name.en}"`);
      return [
        {
          item: exactMatch,
          score: 1.0, // Perfect score for exact match
          matches: undefined,
        },
      ];
    }

    // Perform fuzzy search
    const results = this.fuse.search(cleanQuery, { limit });

    return results.map(result => ({
      item: result.item,
      score: 1 - (result.score || 0), // Convert to similarity (0-1, higher is better)
      matches: result.matches,
    }));
  }

  /**
   * Find best match for OCR text
   * Returns the item with highest confidence if above threshold
   * Prioritizes exact matches
   * @param ocrText - The title/main text from OCR (may be unreliable)
   * @param minConfidence - Minimum confidence threshold for fuzzy matches
   * @param fullOcrText - Full OCR text for candidate extraction and reverse search
   */
  findBestMatch(
    ocrText: string,
    minConfidence = 0.6,
    fullOcrText?: string,
  ): { item: EnrichedItem; confidence: number } | null {
    // Use full text for candidate extraction (more reliable than title extraction)
    const textForCandidates = fullOcrText || ocrText;
    const candidates = this.extractItemCandidates(textForCandidates);

    console.log(
      `[SearchService] Extracted ${candidates.length} candidates: ${candidates.slice(0, 5).join(', ')}${candidates.length > 5 ? '...' : ''}`,
    );

    // First, try exact match on all candidates
    for (const candidate of candidates) {
      const exactMatch = this.exactMatch(candidate);
      if (exactMatch) {
        console.log(`[SearchService] Exact match found: "${exactMatch.name.en}"`);
        return {
          item: exactMatch,
          confidence: 1.0,
        };
      }
    }

    // Fall back to fuzzy search
    let bestMatch: { item: EnrichedItem; confidence: number } | null = null;

    for (const candidate of candidates) {
      const results = this.search(candidate, 1);
      if (results.length > 0 && results[0].score > (bestMatch?.confidence || 0)) {
        if (results[0].score >= minConfidence) {
          bestMatch = {
            item: results[0].item,
            confidence: results[0].score,
          };
        }
      }
    }

    if (bestMatch) {
      console.log(
        `[SearchService] Best match: "${bestMatch.item.name.en}" with confidence ${bestMatch.confidence.toFixed(2)}`,
      );
      return bestMatch;
    }

    // Reverse search: check if any item name is contained in the full OCR text
    // Use fullOcrText if provided, otherwise fall back to ocrText
    const textForReverseSearch = fullOcrText || ocrText;
    // Filter to only mostly uppercase lines for reverse search
    const uppercaseText = this.extractUppercaseText(textForReverseSearch);
    console.log(`[SearchService] Trying reverse search on uppercase text: "${uppercaseText}"`);
    const reverseMatch = this.reverseSearch(uppercaseText);
    if (reverseMatch) {
      console.log(`[SearchService] Reverse search match: "${reverseMatch.name.en}"`);
      return {
        item: reverseMatch,
        confidence: 0.9, // High confidence since it's an exact substring match
      };
    }

    return null;
  }

  /**
   * Extract and merge only mostly uppercase lines from OCR text
   * Used for reverse search to avoid matching description text
   */
  private extractUppercaseText(ocrText: string): string {
    const lines = ocrText.split(/[\n\r]+/).map(l => this.cleanOCRText(l));
    const uppercaseLines = lines.filter(line => line.length >= 3 && this.isMostlyUppercase(line));
    return uppercaseLines.join(' ');
  }

  /**
   * Reverse search: loop through all items and check if item name is contained in the OCR text
   * This helps when OCR extracts extra characters or text around the item name
   */
  private reverseSearch(ocrText: string): EnrichedItem | undefined {
    const fullText = ocrText.toLowerCase();

    // Sort items by name length (longer names first) to prefer more specific matches
    const sortedItems = [...this.items].sort((a, b) => {
      const nameA = a.name[this.currentLanguage as keyof typeof a.name] || a.name.en;
      const nameB = b.name[this.currentLanguage as keyof typeof b.name] || b.name.en;
      return nameB.length - nameA.length;
    });

    for (const item of sortedItems) {
      const localizedName = item.name[this.currentLanguage as keyof typeof item.name];
      const englishName = item.name.en;

      // Check if localized name is in the text (minimum 3 chars to avoid false positives)
      if (localizedName && localizedName.length >= 3 && fullText.includes(localizedName.toLowerCase())) {
        return item;
      }

      // Check if English name is in the text
      if (englishName && englishName.length >= 3 && fullText.includes(englishName.toLowerCase())) {
        return item;
      }
    }

    return undefined;
  }

  /**
   * Normalize Roman numerals that may have been misread by OCR
   * Common mistakes: lowercase 'l' instead of 'I' in sequences like "Ill" -> "III"
   * NOTE: We do NOT convert standalone digits like "1" to "I" because many items
   * use Arabic numerals (e.g., "Combat Mk. 1")
   */
  private normalizeRomanNumerals(text: string): string {
    // Only fix sequences that are clearly misread Roman numerals:
    // - "Ill", "lll", "Il", "ll" etc. that should be "III", "II", "I" etc.
    // - Must contain at least one 'l' (lowercase L) to be considered a misread
    return (
      text
        // Fix patterns like "Ill", "lll", "Il" etc. (must contain lowercase L to be misread)
        .replace(/\s+([IiLl]{2,4})(\s|$)/g, (_match, numeral, trailing) => {
          // Only normalize if it contains lowercase 'l' (misread I)
          if (!/l/.test(numeral)) {
            return _match; // Keep original if no lowercase L
          }
          const normalized = numeral.replace(/[il]/gi, 'I').toUpperCase();
          return ' ' + normalized + trailing;
        })
        // Handle cases where V is mixed in with lowercase L (lV, Vl, etc.)
        .replace(/\s+([IiLl]*[Vv][IiLl]*)(\s|$)/g, (_match, numeral, trailing) => {
          // Only normalize if it contains lowercase 'l' (misread I)
          if (!/l/.test(numeral)) {
            return _match;
          }
          const normalized = numeral.replace(/[il]/gi, 'I').replace(/v/gi, 'V').toUpperCase();
          return ' ' + normalized + trailing;
        })
    );
  }

  /**
   * Clean OCR text for better matching
   */
  private cleanOCRText(text: string): string {
    let cleaned = text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Normalize Roman numerals
    cleaned = this.normalizeRomanNumerals(cleaned);

    return cleaned;
  }

  /**
   * Check if a string is mostly uppercase (>80% of letters are uppercase)
   */
  private isMostlyUppercase(text: string): boolean {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return false;

    const uppercaseCount = (text.match(/[A-Z]/g) || []).length;
    const ratio = uppercaseCount / letters.length;
    return ratio > 0.8;
  }

  /**
   * Extract potential item name candidates from OCR text
   * Game tooltips may contain multiple lines - we want the item name
   * Only keeps lines that are mostly uppercase (>80%)
   * Also combines consecutive uppercase lines for multi-line item names
   */
  private extractItemCandidates(ocrText: string): string[] {
    const candidates: string[] = [];

    // Split by newlines
    const lines = ocrText.split(/[\n\r]+/).map(l => this.cleanOCRText(l));

    // Find uppercase lines
    const uppercaseLines: string[] = [];
    for (const line of lines) {
      if (line.length >= 3 && this.isMostlyUppercase(line)) {
        uppercaseLines.push(line);
      }
    }

    // Combine consecutive uppercase lines (for multi-line item names like "ADVANCED ARC" + "POWERCELL")
    // Try combinations of 2-3 consecutive lines first (more specific matches)
    for (let windowSize = 3; windowSize >= 2; windowSize--) {
      for (let i = 0; i <= uppercaseLines.length - windowSize; i++) {
        const combined = uppercaseLines.slice(i, i + windowSize).join(' ');
        if (!candidates.includes(combined)) {
          candidates.push(combined);
        }
      }
    }

    // Add individual uppercase lines
    for (const line of uppercaseLines) {
      if (!candidates.includes(line)) {
        candidates.push(line);
      }
    }

    return candidates;
  }

  /**
   * Get all items
   */
  getAllItems(): EnrichedItem[] {
    return this.items;
  }

  /**
   * Get item by ID
   */
  getItemById(id: string): EnrichedItem | undefined {
    return this.items.find(item => item.id === id);
  }

  /**
   * Direct name lookup (exact match, case insensitive)
   */
  exactMatch(name: string): EnrichedItem | undefined {
    const normalized = name.toLowerCase().trim();
    // Try current language first, then fallback to English
    return this.items.find(item => {
      const localizedName = item.name[this.currentLanguage as keyof typeof item.name];
      const englishName = item.name.en;
      return (localizedName && localizedName.toLowerCase() === normalized) || englishName.toLowerCase() === normalized;
    });
  }
}
