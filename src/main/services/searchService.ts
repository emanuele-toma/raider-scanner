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
   */
  findBestMatch(ocrText: string, minConfidence = 0.6): { item: EnrichedItem; confidence: number } | null {
    // Extract potential item names from OCR text
    const candidates = this.extractItemCandidates(ocrText);

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
    }

    return bestMatch;
  }

  /**
   * Clean OCR text for better matching
   */
  private cleanOCRText(text: string): string {
    return (
      text
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Extract potential item name candidates from OCR text
   * Game tooltips may contain multiple lines - we want the item name
   */
  private extractItemCandidates(ocrText: string): string[] {
    const candidates: string[] = [];
    const cleaned = this.cleanOCRText(ocrText);

    // The full cleaned text
    if (cleaned.length >= 3) {
      candidates.push(cleaned);
    }

    // Split by newlines and add each line
    const lines = ocrText.split(/[\n\r]+/).map(l => this.cleanOCRText(l));
    for (const line of lines) {
      if (line.length >= 3 && !candidates.includes(line)) {
        candidates.push(line);
      }
    }

    // First line is often the item name in game tooltips
    if (lines.length > 0 && lines[0].length >= 3) {
      // Prioritize first line
      const firstLine = lines[0];
      const idx = candidates.indexOf(firstLine);
      if (idx > 0) {
        candidates.splice(idx, 1);
        candidates.unshift(firstLine);
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
