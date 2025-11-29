/**
 * Raider Scanner - Main Application
 * Dashboard and Settings Interface
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, EnrichedItem } from '../../shared/types';
import './App.css';
import { ARCsPanel } from './components/ARCsPanel/ARCsPanel';
import { CalibrationPanel } from './components/CalibrationPanel';
import { ItemCard } from './components/ItemCard';
import { SearchBar } from './components/SearchBar';
import { SettingsPanel } from './components/SettingsPanel';
import { UpdateNotification } from './components/UpdateNotification';
import { changeLanguage } from './i18n';

interface DataStats {
  items: number;
  quests: number;
  trades: number;
  hideoutStations: number;
  bots: number;
}

interface ScanHistoryEntry {
  item: EnrichedItem;
  timestamp: number;
}

const MAX_HISTORY_ITEMS = 10;

// Format relative time (e.g., "2m ago", "1h ago")
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function App(): React.JSX.Element {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);
  const [selectedItem, setSelectedItem] = useState<EnrichedItem | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'arcs' | 'settings'>('search');
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    async function loadData(): Promise<void> {
      try {
        const [loadedSettings, loadedStats] = await Promise.all([window.api.getSettings(), window.api.getDataStats()]);
        setSettings(loadedSettings);
        setDataStats(loadedStats);

        // Initialize i18next with saved app language
        changeLanguage(loadedSettings.appLanguage);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    // Listen for data loaded events
    const cleanupData = window.api.onDataLoaded(stats => {
      setDataStats(stats as DataStats);
    });

    // Listen for scan results to sync with main app
    const cleanupScan = window.api.onScanResult(result => {
      if (result.success && result.matchedItem) {
        setSelectedItem(result.matchedItem);
        setActiveTab('search');

        // Add to history (avoid duplicates of the same item in a row)
        setScanHistory(prev => {
          const isDuplicate = prev.length > 0 && prev[0].item.id === result.matchedItem!.id;
          if (isDuplicate) {
            // Update timestamp of existing entry
            return [{ item: result.matchedItem!, timestamp: Date.now() }, ...prev.slice(1)];
          }
          // Add new entry and limit history size
          const newHistory = [{ item: result.matchedItem!, timestamp: Date.now() }, ...prev];
          return newHistory.slice(0, MAX_HISTORY_ITEMS);
        });
      }
    });

    return () => {
      cleanupData();
      cleanupScan();
    };
  }, []);

  // Handle item selection
  const handleSelectItem = useCallback((item: EnrichedItem) => {
    setSelectedItem(item);
  }, []);

  // Handle navigating to a bot
  const handleNavigateToBot = useCallback((botId: string) => {
    setSelectedBotId(botId);
    setActiveTab('arcs');
  }, []);

  // Handle navigating to an item from ARCs panel
  const handleNavigateToItem = useCallback(async (itemId: string) => {
    try {
      setIsLoading(true);
      const item = await window.api.getItem(itemId);
      if (item) {
        setSelectedItem(item);
        setActiveTab('search');
      }
    } catch (error) {
      console.error('Failed to navigate to item:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle settings change
  const handleSettingsChange = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
  }, []);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* CRT Effect */}
      {settings?.crtEffect && <div className="crt-overlay" />}

      {/* Title Bar Drag Region */}
      <div className="title-bar">
        <div className="title-bar-drag">
          <span className="app-logo">⚡</span>
          <span className="app-title">{t('app.title')}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="app-content">
        {/* Sidebar */}
        <aside className="app-sidebar">
          {/* Status */}
          <div className="sidebar-section">
            <div className="status-indicator online">
              <span className="status-dot" />
              <span className="status-text">{t('sidebar.online')}</span>
            </div>
            {dataStats && (
              <div className="data-stats">
                <div className="stat">
                  <span className="stat-value">{dataStats.items}</span>
                  <span className="stat-label">{t('sidebar.items')}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{dataStats.quests}</span>
                  <span className="stat-label">{t('sidebar.quests')}</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{dataStats.trades}</span>
                  <span className="stat-label">{t('sidebar.trades')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            <button
              className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <span className="nav-icon">🔍</span>
              <span className="nav-text">{t('sidebar.search')}</span>
            </button>
            <button
              className={`nav-btn ${activeTab === 'arcs' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('arcs');
                setSelectedBotId(null);
              }}
            >
              <span className="nav-icon">🤖</span>
              <span className="nav-text">{t('sidebar.arcs')}</span>
            </button>
            <button
              className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <span className="nav-icon">⚙️</span>
              <span className="nav-text">{t('sidebar.settings')}</span>
            </button>
          </nav>

          {/* Instructions */}
          <div className="sidebar-section sidebar-footer">
            <h3 className="section-title">{t('sidebar.howToUse')}</h3>
            <ol className="instructions">
              <li>{t('sidebar.instruction1')}</li>
              <li>
                {t('sidebar.instruction2')} <kbd>{settings?.hotkey.replace('CommandOrControl+', 'Ctrl+')}</kbd>
              </li>
              <li>{t('sidebar.instruction3')}</li>
            </ol>
          </div>
        </aside>

        {/* Main Panel */}
        <main className="app-main">
          {activeTab === 'search' && (
            <div className="search-panel">
              <h1 className="panel-title">{t('searchPanel.title')}</h1>
              <p className="panel-description">{t('searchPanel.description')}</p>

              <SearchBar onSelectItem={handleSelectItem} appLanguage={settings?.appLanguage} />

              {selectedItem && (
                <div className="selected-item-container">
                  <ItemCard
                    item={selectedItem}
                    onClose={() => setSelectedItem(null)}
                    appLanguage={settings?.appLanguage}
                    onNavigateToBot={handleNavigateToBot}
                  />
                </div>
              )}

              {/* Scan History */}
              {scanHistory.length > 0 && (
                <div className="scan-history">
                  <div className="scan-history-header">
                    <h3 className="scan-history-title">
                      <span className="history-icon">📜</span>
                      {t('searchPanel.recentScans')}
                    </h3>
                    <button
                      className="clear-history-btn"
                      onClick={() => setScanHistory([])}
                      title={t('searchPanel.clearHistory')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                      </svg>
                    </button>
                  </div>
                  <div className="scan-history-list">
                    {scanHistory.map((entry, index) => (
                      <button
                        key={`${entry.item.id}-${entry.timestamp}`}
                        className={`history-item ${selectedItem?.id === entry.item.id ? 'active' : ''}`}
                        onClick={() => handleSelectItem(entry.item)}
                      >
                        <span className="history-index">{index + 1}</span>
                        <span className="history-name">
                          {entry.item.name[settings?.appLanguage || 'en'] || entry.item.name.en}
                        </span>
                        <span className="history-time">{formatTimeAgo(entry.timestamp)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'arcs' && (
            <ARCsPanel
              selectedBotId={selectedBotId}
              onClose={() => setSelectedBotId(null)}
              onNavigateToItem={handleNavigateToItem}
            />
          )}

          {activeTab === 'settings' && settings && (
            <div className="settings-container">
              <CalibrationPanel />
              <SettingsPanel settings={settings} onSettingsChange={handleSettingsChange} />
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <span className="footer-text">{t('app.footer')}</span>
      </footer>

      {/* Update Notification */}
      <UpdateNotification />
    </div>
  );
}

export default App;
