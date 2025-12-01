/**
 * HideoutPanel Component
 * Displays hideout stations with level tracking
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HideoutStation, LocalizedString } from '../../../../shared/types';
import { getLocalizedString } from '../../i18n';
import './HideoutPanel.css';

// Station images
import explosivesImg from '../../../../arcraiders-data/images/workshop/explosivesstation.png';
import gearImg from '../../../../arcraiders-data/images/workshop/gearbench.png';
import gunsmithImg from '../../../../arcraiders-data/images/workshop/gunsmith.png';
import medicalImg from '../../../../arcraiders-data/images/workshop/medicallab.png';
import refinerImg from '../../../../arcraiders-data/images/workshop/refiner.png';
import utilityImg from '../../../../arcraiders-data/images/workshop/utilitystation.png';

interface HideoutPanelProps {
  appLanguage?: string;
  stationLevels: Record<string, number>;
  onSetStationLevel: (stationId: string, level: number) => void;
  onNavigateToItem?: (itemId: string) => void;
}

// Stations that cannot be level 0 (already built by default)
const STATIONS_WITHOUT_LEVEL_ZERO = new Set(['scrappy', 'workbench']);

// Stations that are stuck at a fixed level (no upgrades available)
const STATIONS_FIXED_LEVEL: Record<string, number> = {
  workbench: 1,
};

// Station images mapping
const STATION_IMAGES: Record<string, string> = {
  weapon_bench: gunsmithImg,
  equipment_bench: gearImg,
  med_station: medicalImg,
  explosives_bench: explosivesImg,
  utility_bench: utilityImg,
  refiner: refinerImg,
};

// Station emoji fallbacks (for stations without images)
const STATION_EMOJIS: Record<string, string> = {
  scrappy: '🐔',
  workbench: '🔧',
};

// Station colors
const STATION_COLORS: Record<string, string> = {
  weapon_bench: '#ef4444',
  equipment_bench: '#3b82f6',
  med_station: '#22c55e',
  explosives_bench: '#f97316',
  utility_bench: '#a855f7',
  refiner: '#eab308',
  workbench: '#6b7280',
  stash: '#06b6d4',
  scrappy: '#84cc16',
};

// Custom sort order for stations
const STATION_SORT_ORDER: string[] = [
  'scrappy',
  'workbench',
  'equipment_bench',
  'weapon_bench',
  'utility_bench',
  'explosives_bench',
  'med_station',
  'refiner',
];

// Format item names nicely (fallback for items without localized names)
function formatItemName(itemId: string): string {
  return itemId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function HideoutPanel({
  appLanguage = 'en',
  stationLevels,
  onSetStationLevel,
  onNavigateToItem,
}: HideoutPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [stations, setStations] = useState<HideoutStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [itemNames, setItemNames] = useState<Record<string, LocalizedString>>({});

  // Get localized item name with fallback to formatted ID
  const getItemName = useCallback(
    (itemId: string): string => {
      const localizedName = itemNames[itemId];
      if (localizedName) {
        return getLocalizedString(localizedName, appLanguage);
      }
      return formatItemName(itemId);
    },
    [itemNames, appLanguage],
  );

  // Load hideout stations
  useEffect(() => {
    async function loadStations(): Promise<void> {
      try {
        const loadedStations = (await window.api.getAllHideoutStations()) as HideoutStation[];
        // Filter out coin-only upgrades (like stash), but keep workbench (fixed level station)
        const filteredStations = loadedStations.filter(
          s =>
            STATIONS_FIXED_LEVEL[s.id] !== undefined ||
            (s.maxLevel > 0 && s.levels.some(l => l.requirementItemIds && l.requirementItemIds.length > 0)),
        );
        setStations(filteredStations);

        // Collect all unique item IDs needed
        const itemIds = new Set<string>();
        for (const station of filteredStations) {
          for (const level of station.levels) {
            for (const req of level.requirementItemIds) {
              itemIds.add(req.itemId);
            }
          }
        }

        // Fetch item names
        const names: Record<string, LocalizedString> = {};
        for (const itemId of itemIds) {
          try {
            const item = (await window.api.getItem(itemId)) as { name?: LocalizedString } | null;
            if (item?.name) {
              names[itemId] = item.name;
            }
          } catch {
            // Item not found, will fall back to formatted ID
          }
        }
        setItemNames(names);
      } catch (error) {
        console.error('Failed to load hideout stations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStations();
  }, []);

  // Get minimum level for a station (only Scrappy starts at 1, others can be 0/unbuilt)
  const getMinLevel = useCallback((station: HideoutStation): number => {
    return STATIONS_WITHOUT_LEVEL_ZERO.has(station.id) ? 1 : 0;
  }, []);

  // Get current level for a station (respecting min level)
  const getStationLevel = useCallback(
    (station: HideoutStation): number => {
      const minLevel = getMinLevel(station);
      const savedLevel = stationLevels[station.id];
      // If no saved level, default to min level for this station
      return savedLevel !== undefined ? savedLevel : minLevel;
    },
    [stationLevels, getMinLevel],
  );

  // Handle level change
  const handleLevelChange = useCallback(
    (stationId: string, level: number) => {
      onSetStationLevel(stationId, level);
    },
    [onSetStationLevel],
  );

  // Toggle station expansion
  const toggleStation = useCallback((stationId: string) => {
    setExpandedStation(prev => (prev === stationId ? null : stationId));
  }, []);

  // Calculate progress for a station
  const getStationProgress = useCallback(
    (
      station: HideoutStation,
    ): { current: number; max: number; percent: number; minLevel: number; isFixed: boolean } => {
      const fixedLevel = STATIONS_FIXED_LEVEL[station.id];
      if (fixedLevel !== undefined) {
        // Fixed level station - always 100% complete
        return { current: fixedLevel, max: fixedLevel, percent: 100, minLevel: fixedLevel, isFixed: true };
      }
      const minLevel = getMinLevel(station);
      const current = getStationLevel(station);
      const max = station.maxLevel;
      // Calculate percent based on levels completed from min to max
      const totalLevels = max - minLevel;
      const completedLevels = current - minLevel;
      const percent = totalLevels > 0 ? Math.round((completedLevels / totalLevels) * 100) : 100;
      return { current, max, percent, minLevel, isFixed: false };
    },
    [getStationLevel, getMinLevel],
  );

  // Sort stations by custom order
  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      const indexA = STATION_SORT_ORDER.indexOf(a.id);
      const indexB = STATION_SORT_ORDER.indexOf(b.id);
      // If both are in the order list, sort by that order
      // If one is not in the list, put it at the end
      // If neither is in the list, sort alphabetically
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      const nameA = getLocalizedString(a.name, appLanguage);
      const nameB = getLocalizedString(b.name, appLanguage);
      return nameA.localeCompare(nameB);
    });
  }, [stations, appLanguage]);

  if (loading) {
    return (
      <div className="hideout-panel">
        <div className="hideout-loading">
          <div className="loading-spinner" />
          <p>{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hideout-panel">
      <header className="hideout-header">
        <h1 className="panel-title">{t('hideout.title')}</h1>
        <p className="panel-description">{t('hideout.description')}</p>
      </header>

      <div className="hideout-stations-grid">
        {sortedStations.map(station => {
          const stationName = getLocalizedString(station.name, appLanguage);
          const progress = getStationProgress(station);
          const isExpanded = expandedStation === station.id;
          const stationColor = STATION_COLORS[station.id] || '#6b7280';
          const stationImage = STATION_IMAGES[station.id];
          const stationEmoji = STATION_EMOJIS[station.id];

          return (
            <div
              key={station.id}
              className={`hideout-station-card ${isExpanded ? 'expanded' : ''}`}
              style={{ '--station-color': stationColor } as React.CSSProperties}
            >
              <div className="station-card-header" onClick={() => toggleStation(station.id)}>
                <div className="station-info">
                  {stationImage && <img src={stationImage} alt={stationName} className="station-image" />}
                  {!stationImage && stationEmoji && <span className="station-emoji">{stationEmoji}</span>}
                  <div className="station-details">
                    <h3 className="station-name">{stationName}</h3>
                    <div className="station-level-display">
                      <span className="level-label">{t('hideout.level')}</span>
                      <span className="level-value">
                        {progress.current}/{progress.max}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="station-progress-container">
                  <div className="station-progress-bar">
                    <div className="station-progress-fill" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <span className="station-progress-text">{progress.percent}%</span>
                </div>

                <svg
                  className={`station-expand-icon ${isExpanded ? 'expanded' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {isExpanded && (
                <div className="station-card-body">
                  {progress.isFixed ? (
                    /* Fixed level station - no upgrades available */
                    <div className="station-fixed-message">
                      <span className="fixed-icon">✓</span>
                      <span>{t('hideout.noUpgrades')}</span>
                    </div>
                  ) : (
                    <>
                      {/* Level selector */}
                      <div className="station-level-selector">
                        <span className="level-selector-label">{t('hideout.yourLevel')}</span>
                        <div className="level-buttons">
                          {(() => {
                            // Use minLevel from progress (only Scrappy starts at 1, others at 0)
                            const levelCount = station.maxLevel - progress.minLevel + 1;
                            return Array.from({ length: levelCount }, (_, i) => {
                              const level = progress.minLevel + i;
                              return (
                                <button
                                  key={level}
                                  className={`level-btn ${progress.current === level ? 'active' : ''} ${level < progress.current ? 'completed' : ''}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleLevelChange(station.id, level);
                                  }}
                                >
                                  {level}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Upgrade requirements */}
                      <div className="station-upgrades">
                        {station.levels.map(level => {
                          const isCompleted = progress.current >= level.level;
                          const isNext = progress.current === level.level - 1;

                          if (level.requirementItemIds.length === 0) return null;

                          return (
                            <div
                              key={level.level}
                              className={`upgrade-level ${isCompleted ? 'completed' : ''} ${isNext ? 'next' : ''}`}
                            >
                              <div className="upgrade-level-header">
                                <span className="upgrade-level-title">
                                  {t('hideout.levelUpgrade', { level: level.level })}
                                </span>
                                {isCompleted && <span className="upgrade-status">✓</span>}
                                {isNext && <span className="upgrade-badge next">{t('hideout.next')}</span>}
                              </div>
                              <div className="upgrade-items">
                                {level.requirementItemIds.map(req => (
                                  <button
                                    key={req.itemId}
                                    className={`upgrade-item-btn ${isCompleted ? 'completed' : ''}`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      onNavigateToItem?.(req.itemId);
                                    }}
                                  >
                                    <span className="item-quantity">x{req.quantity}</span>
                                    <span className="item-name">{getItemName(req.itemId)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sortedStations.length === 0 && (
        <div className="hideout-empty">
          <p>{t('hideout.noStations')}</p>
        </div>
      )}
    </div>
  );
}
