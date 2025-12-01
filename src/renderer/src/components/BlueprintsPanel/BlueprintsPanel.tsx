/**
 * BlueprintsPanel Component
 * Displays blueprints with unlock tracking
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedItem } from '../../../../shared/types';
import { getLocalizedString } from '../../i18n';
import './BlueprintsPanel.css';

interface BlueprintsPanelProps {
  appLanguage?: string;
  unlockedBlueprints: Set<string>;
  onSetBlueprintUnlocked: (blueprintId: string, unlocked: boolean) => void;
  onNavigateToItem?: (itemId: string) => void;
}

// Get the item name that this blueprint unlocks (remove "Blueprint" suffix)
function getUnlocksName(blueprint: EnrichedItem, lang: string): string {
  const localizedName = getLocalizedString(blueprint.name, lang);
  // Remove common suffixes like "Blueprint", "Bauplan:", etc.
  return localizedName
    .replace(/\s*blueprint$/i, '')
    .replace(/^bauplan:\s*/i, '')
    .replace(/^schéma\s*(de\s*|d')?/i, '')
    .replace(/^plano\s*de\s*/i, '')
    .replace(/^projeto\s*de\s*/i, '')
    .replace(/^progetto\s*/i, '')
    .replace(/^nacrt\s*/i, '')
    .trim();
}

export function BlueprintsPanel({
  appLanguage = 'en',
  unlockedBlueprints,
  onSetBlueprintUnlocked,
  onNavigateToItem,
}: BlueprintsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [blueprints, setBlueprints] = useState<EnrichedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load all blueprints
  useEffect(() => {
    async function loadBlueprints(): Promise<void> {
      try {
        const allItems = await window.api.getAllItems();
        const blueprintItems = allItems.filter(item => item.type === 'Blueprint');
        setBlueprints(blueprintItems);
      } catch (error) {
        console.error('Failed to load blueprints:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBlueprints();
  }, []);

  // Filter and sort blueprints
  const filteredBlueprints = useMemo(() => {
    let items = blueprints.map(blueprint => ({
      item: blueprint,
      unlocksName: getUnlocksName(blueprint, appLanguage),
    }));

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(({ item, unlocksName }) => {
        const name = getLocalizedString(item.name, appLanguage).toLowerCase();
        return name.includes(query) || unlocksName.toLowerCase().includes(query);
      });
    }

    // Sort alphabetically by unlock name
    items.sort((a, b) => a.unlocksName.localeCompare(b.unlocksName));

    return items;
  }, [blueprints, appLanguage, searchQuery]);

  // Toggle blueprint unlock status
  const handleToggleUnlock = useCallback(
    (blueprintId: string) => {
      const isUnlocked = unlockedBlueprints.has(blueprintId);
      onSetBlueprintUnlocked(blueprintId, !isUnlocked);
    },
    [unlockedBlueprints, onSetBlueprintUnlocked],
  );

  // Calculate progress
  const progress = useMemo(() => {
    const total = blueprints.length;
    const unlocked = blueprints.filter(b => unlockedBlueprints.has(b.id)).length;
    const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    return { unlocked, total, percent };
  }, [blueprints, unlockedBlueprints]);

  if (loading) {
    return (
      <div className="blueprints-panel">
        <div className="blueprints-loading">
          <div className="loading-spinner" />
          <p>{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="blueprints-panel">
      <header className="blueprints-header">
        <h1 className="panel-title">{t('blueprints.title')}</h1>
        <p className="panel-description">{t('blueprints.description')}</p>

        {/* Overall Progress */}
        <div className="blueprints-overall-progress">
          <div className="progress-label">
            <span>{t('blueprints.overallProgress')}</span>
            <span className="progress-count">
              {progress.unlocked}/{progress.total}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="progress-percent">{progress.percent}%</span>
        </div>

        {/* Search */}
        <div className="blueprints-search">
          <input
            type="text"
            className="search-input"
            placeholder={t('blueprints.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="blueprints-list">
        {filteredBlueprints.map(({ item, unlocksName }) => {
          const isUnlocked = unlockedBlueprints.has(item.id);
          return (
            <div key={item.id} className={`blueprint-item ${isUnlocked ? 'unlocked' : ''}`}>
              <button
                className="blueprint-checkbox"
                onClick={() => handleToggleUnlock(item.id)}
                title={isUnlocked ? t('blueprints.markLocked') : t('blueprints.markUnlocked')}
              >
                {isUnlocked ? '✓' : ''}
              </button>
              <button className="blueprint-name" onClick={() => onNavigateToItem?.(item.id)}>
                {unlocksName}
              </button>
              <span className={`blueprint-rarity rarity-${item.rarity?.toLowerCase()}`}>{item.rarity}</span>
            </div>
          );
        })}
      </div>

      {filteredBlueprints.length === 0 && (
        <div className="blueprints-empty">
          <p>{t('blueprints.noBlueprints')}</p>
        </div>
      )}
    </div>
  );
}
