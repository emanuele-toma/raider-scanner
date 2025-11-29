/**
 * ARCs Panel Component
 * Displays information about ARC enemy bots with multi-page navigation
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bot } from '../../../../shared/types';
import './ARCsPanel.css';

// Import all bot images using Vite's glob import
// This creates a static mapping that Vite can analyze and bundle
const botImageModules = import.meta.glob<{ default: string }>('../../../../arcraiders-data/images/bots/*.{png,webp}', {
  eager: true,
});

// Create a map from filename to URL
const botImages: Record<string, string> = {};
for (const path in botImageModules) {
  // Extract filename without extension (e.g., "arc_bastion" from ".../arc_bastion.png")
  const filename =
    path
      .split('/')
      .pop()
      ?.replace(/\.(png|webp)$/, '') || '';
  botImages[filename] = botImageModules[path].default;
}

/**
 * Get the local image URL for a bot
 * Falls back to CDN URL if local image not found
 */
function getBotImageUrl(bot: Bot): string {
  // Extract the filename from CDN URL (e.g., "arc_bastion" from "https://cdn.arctracker.io/bots/arc_bastion.png")
  const cdnFilename =
    bot.image
      .split('/')
      .pop()
      ?.replace(/\.(png|webp)$/, '') || '';
  return botImages[cdnFilename] || bot.image;
}

interface ARCsPanelProps {
  selectedBotId?: string | null;
  onClose?: () => void;
  onNavigateToItem?: (itemId: string) => void;
}

// Threat level colors and icons
const THREAT_CONFIG: Record<string, { color: string; icon: string; glow: string }> = {
  Low: { color: '#4ade80', icon: '◆', glow: 'rgba(74, 222, 128, 0.3)' },
  Moderate: { color: '#facc15', icon: '◆◆', glow: 'rgba(250, 204, 21, 0.3)' },
  High: { color: '#f97316', icon: '◆◆◆', glow: 'rgba(249, 115, 22, 0.3)' },
  Critical: { color: '#ef4444', icon: '◆◆◆◆', glow: 'rgba(239, 68, 68, 0.3)' },
  Extreme: { color: '#a855f7', icon: '◆◆◆◆◆', glow: 'rgba(168, 85, 247, 0.3)' },
};

// Format map names nicely
function formatMapName(mapId: string): string {
  return mapId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Format item names nicely
function formatItemName(itemId: string): string {
  return itemId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ARCsPanel({ selectedBotId, onClose, onNavigateToItem }: ARCsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load all bots on mount
  useEffect(() => {
    async function loadBots(): Promise<void> {
      try {
        const allBots = await window.api.getAllBots();
        // Sort by threat level
        const threatOrder = ['Low', 'Moderate', 'High', 'Critical', 'Extreme'];
        allBots.sort((a, b) => threatOrder.indexOf(a.threat) - threatOrder.indexOf(b.threat));
        setBots(allBots);
      } catch (error) {
        console.error('Failed to load bots:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadBots();
  }, []);

  // Handle selected bot from prop (when navigating from item card)
  useEffect(() => {
    if (selectedBotId && bots.length > 0) {
      const bot = bots.find(b => b.id === selectedBotId);
      if (bot) {
        setSelectedBot(bot);
      }
    }
  }, [selectedBotId, bots]);

  const handleSelectBot = useCallback((bot: Bot): void => {
    setSelectedBot(bot);
    // Scroll to top when entering detail view
    requestAnimationFrame(() => {
      document.querySelector('.arcs-panel')?.scrollTo({ top: 0 });
    });
  }, []);

  const handleBack = useCallback((): void => {
    setSelectedBot(null);
    onClose?.();
  }, [onClose]);

  const filteredBots = bots.filter(
    bot =>
      bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bot.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="arcs-panel">
        <div className="arcs-loading">
          <div className="loading-spinner" />
          <p>{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  // Detail Page View
  if (selectedBot) {
    const threatConfig = THREAT_CONFIG[selectedBot.threat] || {
      color: '#888',
      icon: '◆',
      glow: 'rgba(136, 136, 136, 0.3)',
    };

    return (
      <div className="arcs-panel">
        <div className="arc-detail-header">
          <button className="arc-back-btn" onClick={handleBack}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('arcs.backToList')}
          </button>
        </div>

        {/* Hero Section */}
        <div className="arc-hero">
          <div className="arc-hero-image">
            <img
              src={getBotImageUrl(selectedBot)}
              alt={selectedBot.name}
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div className="arc-hero-content">
            <h1 className="arc-hero-name">{selectedBot.name}</h1>
            <span className="arc-hero-type">{selectedBot.type}</span>

            <div className="arc-hero-stats">
              <div className="arc-hero-stat">
                <span className="stat-label">Threat Level</span>
                <span className="stat-value" style={{ color: threatConfig.color }}>
                  {threatConfig.icon} {selectedBot.threat}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="arc-detail-grid">
          {/* Weakness Card - Prominent */}
          <div className="arc-card arc-card-weakness">
            <div className="arc-card-header">
              <span className="arc-card-icon">🎯</span>
              <h3 className="arc-card-title">{t('arcs.weakness')}</h3>
            </div>
            <p className="arc-card-text highlight">{selectedBot.weakness}</p>
          </div>

          {/* XP Card */}
          <div className="arc-card arc-card-xp">
            <div className="arc-card-header">
              <span className="arc-card-icon">✨</span>
              <h3 className="arc-card-title">{t('arcs.xp')}</h3>
            </div>
            <div className="arc-xp-stats">
              <div className="arc-xp-item">
                <span className="xp-value">{selectedBot.destroyXp}</span>
                <span className="xp-label">{t('arcs.destroyXp')}</span>
              </div>
              <div className="arc-xp-item">
                <span className="xp-value">{selectedBot.lootXp}</span>
                <span className="xp-label">{t('arcs.lootXp')}</span>
              </div>
              <div className="arc-xp-item">
                <span className="xp-value">{selectedBot.destroyXp + selectedBot.lootXp}</span>
                <span className="xp-label">{t('arcs.totalXp')}</span>
              </div>
            </div>
          </div>

          {/* Description Card */}
          <div className="arc-card arc-card-description">
            <div className="arc-card-header">
              <span className="arc-card-icon">📋</span>
              <h3 className="arc-card-title">{t('arcs.overview')}</h3>
            </div>
            <p className="arc-card-text">{selectedBot.description}</p>
          </div>

          {/* Locations Card */}
          {selectedBot.maps && selectedBot.maps.length > 0 && (
            <div className="arc-card arc-card-locations">
              <div className="arc-card-header">
                <span className="arc-card-icon">🗺️</span>
                <h3 className="arc-card-title">{t('arcs.foundOn')}</h3>
              </div>
              <div className="arc-location-list">
                {selectedBot.maps.map(map => (
                  <div key={map} className="arc-location-tag">
                    <span className="arc-location-icon">📍</span>
                    {formatMapName(map)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drops Card */}
          {selectedBot.drops && selectedBot.drops.length > 0 && (
            <div className="arc-card arc-card-drops">
              <div className="arc-card-header">
                <span className="arc-card-icon">📦</span>
                <h3 className="arc-card-title">{t('arcs.drops')}</h3>
                <span className="arc-card-count">{selectedBot.drops.length} items</span>
              </div>
              <div className="arc-drops-grid">
                {selectedBot.drops.map(drop => (
                  <button key={drop} className="arc-drop-item" onClick={() => onNavigateToItem?.(drop)}>
                    <span className="arc-drop-icon">🔹</span>
                    <span className="arc-drop-name">{formatItemName(drop)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid View (Main Page)
  return (
    <div className="arcs-panel">
      <div className="arcs-header">
        <h1 className="panel-title">{t('arcs.title')}</h1>
        <p className="panel-description">{t('arcs.description')}</p>

        <div className="arcs-search-container">
          <span className="arcs-search-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            className="arcs-search-input"
            placeholder="Search ARCs by name or type..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Bot Grid */}
      <div className="arcs-grid">
        {filteredBots.map(bot => {
          const threatConfig = THREAT_CONFIG[bot.threat] || {
            color: '#888',
            icon: '◆',
            glow: 'rgba(136, 136, 136, 0.3)',
          };

          return (
            <button key={bot.id} className="arc-grid-item" onClick={() => handleSelectBot(bot)}>
              <div className="arc-grid-header">
                <div className="arc-grid-image">
                  <img
                    src={getBotImageUrl(bot)}
                    alt={bot.name}
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="arc-grid-info">
                  <h3 className="arc-grid-name">{bot.name}</h3>
                  <span className="arc-grid-type">{bot.type}</span>
                </div>
              </div>

              <div className="arc-grid-body">
                <div className="arc-grid-stat">
                  <span className="arc-grid-stat-label">Threat</span>
                  <span className="threat-badge" style={{ color: threatConfig.color }}>
                    {threatConfig.icon} {bot.threat}
                  </span>
                </div>

                <div className="arc-grid-weakness">
                  <span className="weakness-label">Weakness</span>
                  <span className="weakness-text">{bot.weakness}</span>
                </div>
              </div>

              <div className="arc-grid-footer">
                <span className="arc-grid-stat-label">XP: {bot.destroyXp + bot.lootXp}</span>
                <span className="view-details">
                  View Details
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
