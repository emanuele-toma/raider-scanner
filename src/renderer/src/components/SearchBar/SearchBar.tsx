/**
 * SearchBar Component
 * Allows manual item search with autocomplete
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedItem } from '../../../../shared/types';
import { getLocalizedString } from '../../i18n';
import './SearchBar.css';

interface SearchResult {
  item: EnrichedItem;
  score: number;
}

interface SearchBarProps {
  onSelectItem: (item: EnrichedItem) => void;
  appLanguage?: string;
}

export default function SearchBar({ onSelectItem, appLanguage = 'en' }: SearchBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const searchResults = await window.api.searchItem(query);
        setResults(searchResults as SearchResult[]);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelectItem(results[selectedIndex].item);
            setQuery('');
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          break;
      }
    },
    [isOpen, results, selectedIndex, onSelectItem],
  );

  // Handle result click
  const handleResultClick = useCallback(
    (item: EnrichedItem) => {
      onSelectItem(item);
      setQuery('');
      setIsOpen(false);
    },
    [onSelectItem],
  );

  return (
    <div className="search-bar-container">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            className="search-clear"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map((result, index) => (
            <div
              key={result.item.id}
              className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleResultClick(result.item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="result-name">{getLocalizedString(result.item.name, appLanguage)}</span>
              <span className="result-meta">
                <span className={`result-rarity rarity-${result.item.rarity?.toLowerCase() || 'common'}`}>
                  {result.item.rarity}
                </span>
                <span className="result-score">{Math.round(result.score * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
