/**
 * QuestsPanel Component
 * Displays all quests organized by trader with completion tracking
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalizedString, Quest } from '../../../../shared/types';
import { getLocalizedString } from '../../i18n';
import './QuestsPanel.css';

// Trader images
import apolloImg from '../../../../arcraiders-data/images/traders/apollo.png';
import celesteImg from '../../../../arcraiders-data/images/traders/celeste.png';
import lanceImg from '../../../../arcraiders-data/images/traders/lance.png';
import shaniImg from '../../../../arcraiders-data/images/traders/shani.png';
import tianwenImg from '../../../../arcraiders-data/images/traders/tianwen.png';

interface QuestsPanelProps {
  appLanguage?: string;
  completedQuests: Set<string>;
  inProgressQuests: Set<string>;
  onToggleQuestComplete: (questId: string, completed: boolean) => void;
  onToggleQuestInProgress: (questId: string, inProgress: boolean) => void;
  onNavigateToItem?: (itemId: string) => void;
}

// Trader colors and images
const TRADER_CONFIG: Record<string, { color: string; image: string }> = {
  Shani: { color: '#f97316', image: shaniImg },
  Apollo: { color: '#3b82f6', image: apolloImg },
  Celeste: { color: '#22c55e', image: celesteImg },
  Lance: { color: '#ef4444', image: lanceImg },
  'Tian Wen': { color: '#a855f7', image: tianwenImg },
  Unknown: { color: '#6b7280', image: '' },
};

// Format item names nicely
function formatItemName(itemId: string): string {
  return itemId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Sort quests by progression chain (topological sort based on total depth across all traders)
function sortQuestsByProgression(quests: Quest[], allQuestsMap: Map<string, Quest>): Quest[] {
  // Calculate depth for each quest (total chain depth across ALL traders)
  const depthCache = new Map<string, number>();

  function getDepth(questId: string): number {
    if (depthCache.has(questId)) {
      return depthCache.get(questId)!;
    }

    const quest = allQuestsMap.get(questId);
    if (!quest || !quest.previousQuestIds || quest.previousQuestIds.length === 0) {
      depthCache.set(questId, 0);
      return 0;
    }

    // Calculate depth across ALL traders (not just same trader)
    const maxPrevDepth = Math.max(
      ...quest.previousQuestIds.map(prevId => {
        if (allQuestsMap.has(prevId)) {
          return getDepth(prevId);
        }
        return -1;
      }),
    );

    const depth = maxPrevDepth + 1;
    depthCache.set(questId, depth);
    return depth;
  }

  // Calculate depth for all quests
  quests.forEach(q => getDepth(q.id));

  // Sort by depth, then by name as tiebreaker
  return [...quests].sort((a, b) => {
    const depthA = depthCache.get(a.id) || 0;
    const depthB = depthCache.get(b.id) || 0;
    if (depthA !== depthB) return depthA - depthB;
    return 0; // Keep original order for same depth
  });
}

// Get all previous quests recursively (for cascade completion) - works across all traders
function getAllPreviousQuests(questId: string, questMap: Map<string, Quest>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  function traverse(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const quest = questMap.get(id);
    if (!quest) return;

    if (quest.previousQuestIds && quest.previousQuestIds.length > 0) {
      for (const prevId of quest.previousQuestIds) {
        // Add any previous quest, regardless of trader
        if (questMap.has(prevId)) {
          result.push(prevId);
          traverse(prevId);
        }
      }
    }
  }

  traverse(questId);
  return result;
}

export function QuestsPanel({
  appLanguage = 'en',
  completedQuests,
  inProgressQuests,
  onToggleQuestComplete,
  onToggleQuestInProgress,
  onNavigateToItem,
}: QuestsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);
  const [expandedQuest, setExpandedQuest] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cascadeConfirmation, setCascadeConfirmation] = useState<{
    questId: string;
    questName: string;
    previousQuests: string[];
    action: 'complete' | 'in-progress';
  } | null>(null);
  const [cascadeExpanded, setCascadeExpanded] = useState(false);
  const questRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load all quests on mount
  useEffect(() => {
    async function loadQuests(): Promise<void> {
      try {
        const allQuests = (await window.api.getAllQuests()) as Quest[];
        setQuests(allQuests);
      } catch (error) {
        console.error('Failed to load quests:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadQuests();
  }, []);

  // Group quests by trader
  const questsByTrader = quests.reduce(
    (acc, quest) => {
      const trader = quest.trader || 'Unknown';
      if (!acc[trader]) {
        acc[trader] = [];
      }
      acc[trader].push(quest);
      return acc;
    },
    {} as Record<string, Quest[]>,
  );

  // Create a map of all quests for lookups
  const questMap = useMemo(() => {
    const map = new Map<string, Quest>();
    quests.forEach(q => map.set(q.id, q));
    return map;
  }, [quests]);

  // Get traders sorted with quest counts
  const traders = Object.keys(questsByTrader).sort();

  // Filter quests based on selected trader and show completed
  const filteredQuests = selectedTrader
    ? questsByTrader[selectedTrader]?.filter(q => showCompleted || !completedQuests.has(q.id)) || []
    : [];

  // Sort quests by progression chain (using global depth across all traders)
  const sortedQuests = sortQuestsByProgression(filteredQuests, questMap);

  // Search results - filter all quests by search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return quests
      .filter(quest => {
        const name = getLocalizedString(quest.name, appLanguage).toLowerCase();
        const description = quest.description ? getLocalizedString(quest.description, appLanguage).toLowerCase() : '';
        return name.includes(query) || description.includes(query);
      })
      .slice(0, 10); // Limit to 10 results
  }, [quests, searchQuery, appLanguage]);

  // Navigate to a specific quest
  const handleNavigateToQuest = useCallback((quest: Quest) => {
    setSearchQuery('');
    setSelectedTrader(quest.trader || 'Unknown');
    setExpandedQuest(quest.id);
    // Scroll to quest after state updates and render
    setTimeout(() => {
      const questElement = questRefs.current.get(quest.id);
      if (questElement) {
        questElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  // Navigate to a quest by ID (for unlocked by / unlocks links)
  const handleNavigateToQuestById = useCallback(
    (questId: string) => {
      const quest = questMap.get(questId);
      if (quest) {
        handleNavigateToQuest(quest);
      }
    },
    [questMap, handleNavigateToQuest],
  );

  // Calculate progress stats
  const getTraderProgress = useCallback(
    (trader: string) => {
      const traderQuests = questsByTrader[trader] || [];
      const completed = traderQuests.filter(q => completedQuests.has(q.id)).length;
      return { completed, total: traderQuests.length };
    },
    [questsByTrader, completedQuests],
  );

  const handleToggleQuest = useCallback(
    (questId: string) => {
      const isCompleted = completedQuests.has(questId);

      if (!isCompleted) {
        // When completing a quest, check if there are previous quests to cascade
        const previousQuests = getAllPreviousQuests(questId, questMap);
        const incompletePrevious = previousQuests.filter(id => !completedQuests.has(id));

        if (incompletePrevious.length > 0) {
          // Show confirmation dialog
          const quest = questMap.get(questId);
          const questName = quest ? getLocalizedString(quest.name, appLanguage) : questId;
          setCascadeConfirmation({
            questId,
            questName,
            previousQuests: incompletePrevious,
            action: 'complete',
          });
          return;
        }
      }

      onToggleQuestComplete(questId, !isCompleted);
    },
    [completedQuests, onToggleQuestComplete, questMap, appLanguage],
  );

  // Handle confirmation of cascade completion
  const handleConfirmCascade = useCallback(() => {
    if (!cascadeConfirmation) return;

    // Complete all previous quests
    for (const prevId of cascadeConfirmation.previousQuests) {
      onToggleQuestComplete(prevId, true);
    }
    // Complete or set in-progress the target quest based on action
    if (cascadeConfirmation.action === 'complete') {
      onToggleQuestComplete(cascadeConfirmation.questId, true);
    } else {
      onToggleQuestInProgress(cascadeConfirmation.questId, true);
    }
    setCascadeConfirmation(null);
    setCascadeExpanded(false);
  }, [cascadeConfirmation, onToggleQuestComplete, onToggleQuestInProgress]);

  // Handle completing only the target quest (skip cascade)
  const handleSkipCascade = useCallback(() => {
    if (!cascadeConfirmation) return;

    // Just complete or set in-progress the target quest based on action
    if (cascadeConfirmation.action === 'complete') {
      onToggleQuestComplete(cascadeConfirmation.questId, true);
    } else {
      onToggleQuestInProgress(cascadeConfirmation.questId, true);
    }
    setCascadeConfirmation(null);
    setCascadeExpanded(false);
  }, [cascadeConfirmation, onToggleQuestComplete, onToggleQuestInProgress]);

  // Handle cancel cascade
  const handleCancelCascade = useCallback(() => {
    setCascadeConfirmation(null);
    setCascadeExpanded(false);
  }, []);

  // Handle toggling in-progress state
  const handleToggleInProgress = useCallback(
    (questId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const isInProgress = inProgressQuests.has(questId);

      if (!isInProgress) {
        // When setting to in-progress, check if there are incomplete previous quests
        const previousQuests = getAllPreviousQuests(questId, questMap);
        const incompletePrevious = previousQuests.filter(id => !completedQuests.has(id));

        if (incompletePrevious.length > 0) {
          // Show confirmation dialog
          const quest = questMap.get(questId);
          const questName = quest ? getLocalizedString(quest.name, appLanguage) : questId;
          setCascadeConfirmation({
            questId,
            questName,
            previousQuests: incompletePrevious,
            action: 'in-progress',
          });
          return;
        }
      }

      onToggleQuestInProgress(questId, !isInProgress);
    },
    [inProgressQuests, onToggleQuestInProgress, completedQuests, questMap, appLanguage],
  );

  if (isLoading) {
    return (
      <div className="quests-panel">
        <div className="quests-loading">
          <div className="loading-spinner" />
          <p>{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  // Trader Selection View
  if (!selectedTrader) {
    const totalCompleted = quests.filter(q => completedQuests.has(q.id)).length;
    const totalQuests = quests.length;

    return (
      <div className="quests-panel">
        <div className="quests-header">
          <h1 className="panel-title">{t('quests.title')}</h1>
          <p className="panel-description">{t('quests.description')}</p>

          {/* Search Bar */}
          <div className="quests-search-container">
            <div className="quests-search-wrapper">
              <svg className="quests-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="quests-search-input"
                placeholder={t('quests.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="quests-search-clear" onClick={() => setSearchQuery('')}>
                  ✕
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="quests-search-results">
                {searchResults.map(quest => {
                  const config = TRADER_CONFIG[quest.trader || 'Unknown'] || TRADER_CONFIG.Unknown;
                  const isCompleted = completedQuests.has(quest.id);
                  return (
                    <button
                      key={quest.id}
                      className={`quests-search-result ${isCompleted ? 'completed' : ''}`}
                      onClick={() => handleNavigateToQuest(quest)}
                    >
                      {config.image && <img src={config.image} alt={quest.trader} className="search-result-avatar" />}
                      <div className="search-result-info">
                        <span className="search-result-name">
                          {isCompleted && <span className="search-result-check">✓</span>}
                          {getLocalizedString(quest.name, appLanguage)}
                        </span>
                        <span className="search-result-trader" style={{ color: config.color }}>
                          {quest.trader}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overall Progress */}
          <div className="quests-overall-progress">
            <div className="progress-stats">
              <span className="progress-label">{t('quests.overallProgress')}</span>
              <span className="progress-numbers">
                {totalCompleted} / {totalQuests}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${totalQuests > 0 ? (totalCompleted / totalQuests) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Trader Grid */}
        <div className="traders-grid">
          {traders.map(trader => {
            const config = TRADER_CONFIG[trader] || TRADER_CONFIG.Unknown;
            const progress = getTraderProgress(trader);
            const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

            return (
              <button key={trader} className="trader-card" onClick={() => setSelectedTrader(trader)}>
                <div className="trader-header">
                  {config.image ? (
                    <img src={config.image} alt={trader} className="trader-avatar" />
                  ) : (
                    <span className="trader-avatar-placeholder">?</span>
                  )}
                  <h3 className="trader-name" style={{ color: config.color }}>
                    {trader}
                  </h3>
                </div>

                <div className="trader-progress">
                  <div className="trader-progress-bar">
                    <div
                      className="trader-progress-fill"
                      style={{ width: `${progressPercent}%`, backgroundColor: config.color }}
                    />
                  </div>
                  <span className="trader-progress-text">
                    {progress.completed} / {progress.total} {t('quests.completed')}
                  </span>
                </div>

                <span className="trader-view-btn">
                  {t('quests.viewQuests')}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Quest List View
  const traderConfig = TRADER_CONFIG[selectedTrader] || TRADER_CONFIG.Unknown;
  const traderProgress = getTraderProgress(selectedTrader);

  return (
    <div className="quests-panel">
      <div className="quests-header">
        <button className="quest-back-btn" onClick={() => setSelectedTrader(null)}>
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
          {t('quests.backToTraders')}
        </button>

        <div className="quests-trader-header">
          {traderConfig.image ? (
            <img src={traderConfig.image} alt={selectedTrader} className="trader-avatar-large" />
          ) : (
            <span className="trader-avatar-placeholder large">?</span>
          )}
          <div className="trader-info">
            <h2 className="trader-title" style={{ color: traderConfig.color }}>
              {selectedTrader}
            </h2>
            <span className="trader-subtitle">
              {traderProgress.completed} / {traderProgress.total} {t('quests.completed')}
            </span>
          </div>
        </div>

        {/* Filter Toggle */}
        <label className="show-completed-toggle">
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          <span className="toggle-label">{t('quests.showCompleted')}</span>
        </label>
      </div>

      {/* Quest List */}
      <div className="quests-list">
        {sortedQuests.map((quest, index) => {
          const isCompleted = completedQuests.has(quest.id);
          const isInProgress = inProgressQuests.has(quest.id);
          const isExpanded = expandedQuest === quest.id;
          const questName = getLocalizedString(quest.name, appLanguage);
          const questDescription = quest.description ? getLocalizedString(quest.description, appLanguage) : null;

          return (
            <div
              key={quest.id}
              ref={el => {
                if (el) questRefs.current.set(quest.id, el);
              }}
              className={`quest-card ${isCompleted ? 'completed' : ''} ${isInProgress ? 'in-progress' : ''} ${isExpanded ? 'expanded' : ''}`}
            >
              <div className="quest-card-header" onClick={() => setExpandedQuest(isExpanded ? null : quest.id)}>
                <span className="quest-number">{index + 1}</span>
                <button
                  className={`quest-checkbox ${isCompleted ? 'checked' : ''}`}
                  onClick={e => {
                    e.stopPropagation();
                    handleToggleQuest(quest.id);
                  }}
                  title={isCompleted ? t('quests.markIncomplete') : t('quests.markComplete')}
                >
                  {isCompleted && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="quest-info">
                  <div className="quest-name-row">
                    <h3 className={`quest-name ${isCompleted ? 'completed' : ''}`}>{questName}</h3>
                    {isInProgress && <span className="quest-in-progress-badge">{t('quests.inProgress')}</span>}
                  </div>
                  {quest.objectives && quest.objectives.length > 0 && (
                    <span className="quest-objective-count">
                      {quest.objectives.length} {t('quests.objectives')}
                    </span>
                  )}
                </div>

                {/* In-progress toggle button */}
                {!isCompleted && (
                  <button
                    className={`quest-in-progress-btn ${isInProgress ? 'active' : ''}`}
                    onClick={e => handleToggleInProgress(quest.id, e)}
                    title={isInProgress ? t('quests.removeFromProgress') : t('quests.markInProgress')}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </button>
                )}

                <svg
                  className={`quest-expand-icon ${isExpanded ? 'expanded' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {isExpanded && (
                <div className="quest-card-body">
                  {/* Description */}
                  {questDescription && <p className="quest-description">{questDescription}</p>}

                  {/* Objectives */}
                  {quest.objectives && quest.objectives.length > 0 && (
                    <div className="quest-section">
                      <h4 className="quest-section-title">
                        <span className="section-icon">📋</span>
                        {t('quests.objectivesTitle')}
                      </h4>
                      <ul className="quest-objectives">
                        {quest.objectives.map((obj, i) => (
                          <li key={i} className="quest-objective">
                            <span className="objective-bullet">•</span>
                            {getLocalizedString(obj as LocalizedString, appLanguage)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Required Items */}
                  {quest.requiredItemIds && quest.requiredItemIds.length > 0 && (
                    <div className="quest-section">
                      <h4 className="quest-section-title">
                        <span className="section-icon">📦</span>
                        {t('quests.requiredItems')}
                      </h4>
                      <div className="quest-items">
                        {quest.requiredItemIds.map(item => (
                          <button
                            key={item.itemId}
                            className="quest-item-btn"
                            onClick={() => onNavigateToItem?.(item.itemId)}
                          >
                            <span className="item-quantity">x{item.quantity}</span>
                            <span className="item-name">{formatItemName(item.itemId)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rewards */}
                  {quest.rewardItemIds && quest.rewardItemIds.length > 0 && (
                    <div className="quest-section">
                      <h4 className="quest-section-title">
                        <span className="section-icon">🎁</span>
                        {t('quests.rewards')}
                      </h4>
                      <div className="quest-items quest-rewards">
                        {quest.rewardItemIds.map(item => (
                          <button
                            key={item.itemId}
                            className="quest-item-btn reward"
                            onClick={() => onNavigateToItem?.(item.itemId)}
                          >
                            <span className="item-quantity">x{item.quantity}</span>
                            <span className="item-name">{formatItemName(item.itemId)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* XP */}
                  {quest.xp !== undefined && quest.xp > 0 && (
                    <div className="quest-xp">
                      <span className="xp-icon">✨</span>
                      <span className="xp-value">{quest.xp} XP</span>
                    </div>
                  )}

                  {/* Unlocked by (previous quests) */}
                  {quest.previousQuestIds && quest.previousQuestIds.length > 0 && (
                    <div className="quest-section">
                      <h4 className="quest-section-title">
                        <span className="section-icon">🔓</span>
                        {t('quests.unlockedBy')}
                      </h4>
                      <div className="quest-chain-links">
                        {quest.previousQuestIds.map(prevId => {
                          const prevQuest = questMap.get(prevId);
                          return prevQuest ? (
                            <button
                              key={prevId}
                              className="quest-chain-link-btn"
                              onClick={e => {
                                e.stopPropagation();
                                handleNavigateToQuestById(prevId);
                              }}
                            >
                              <span className="quest-chain-name">
                                {getLocalizedString(prevQuest.name, appLanguage)}
                              </span>
                              <span className="quest-chain-trader">({prevQuest.trader})</span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unlocks (next quests) */}
                  {quest.nextQuestIds && quest.nextQuestIds.length > 0 && (
                    <div className="quest-section">
                      <h4 className="quest-section-title">
                        <span className="section-icon">🔗</span>
                        {t('quests.unlocks')}
                      </h4>
                      <div className="quest-chain-links">
                        {quest.nextQuestIds.map(nextId => {
                          const nextQuest = questMap.get(nextId);
                          return nextQuest ? (
                            <button
                              key={nextId}
                              className="quest-chain-link-btn"
                              onClick={e => {
                                e.stopPropagation();
                                handleNavigateToQuestById(nextId);
                              }}
                            >
                              <span className="quest-chain-name">
                                {getLocalizedString(nextQuest.name, appLanguage)}
                              </span>
                              <span className="quest-chain-trader">({nextQuest.trader})</span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sortedQuests.length === 0 && (
          <div className="quests-empty">
            <p>{showCompleted ? t('quests.noQuests') : t('quests.allCompleted')}</p>
          </div>
        )}
      </div>

      {/* Cascade Confirmation Modal */}
      {cascadeConfirmation && (
        <div className="cascade-modal-overlay" onClick={handleCancelCascade}>
          <div className="cascade-modal" onClick={e => e.stopPropagation()}>
            <h3 className="cascade-modal-title">{t('quests.cascadeTitle')}</h3>
            <p className="cascade-modal-message">
              {cascadeConfirmation.action === 'complete'
                ? t('quests.cascadeMessage', {
                    count: cascadeConfirmation.previousQuests.length,
                    quest: cascadeConfirmation.questName,
                  })
                : t('quests.cascadeMessageInProgress', {
                    count: cascadeConfirmation.previousQuests.length,
                    quest: cascadeConfirmation.questName,
                  })}
            </p>
            <div className="cascade-modal-quests">
              {(cascadeExpanded
                ? cascadeConfirmation.previousQuests
                : cascadeConfirmation.previousQuests.slice(0, 5)
              ).map(prevId => {
                const prevQuest = questMap.get(prevId);
                return prevQuest ? (
                  <div key={prevId} className="cascade-quest-item">
                    <span className="cascade-quest-bullet">•</span>
                    <span className="cascade-quest-name">{getLocalizedString(prevQuest.name, appLanguage)}</span>
                    <span className="cascade-quest-trader">({prevQuest.trader})</span>
                  </div>
                ) : null;
              })}
              {cascadeConfirmation.previousQuests.length > 5 && (
                <div className="cascade-quest-more clickable" onClick={() => setCascadeExpanded(!cascadeExpanded)}>
                  {cascadeExpanded
                    ? t('itemCard.showLess')
                    : t('quests.cascadeMore', { count: cascadeConfirmation.previousQuests.length - 5 })}
                </div>
              )}
            </div>
            <div className="cascade-modal-actions">
              <button className="cascade-btn cascade-btn-confirm" onClick={handleConfirmCascade}>
                {t('quests.cascadeConfirm')}
              </button>
              <button className="cascade-btn cascade-btn-skip" onClick={handleSkipCascade}>
                {cascadeConfirmation.action === 'complete'
                  ? t('quests.cascadeSkip')
                  : t('quests.cascadeSkipInProgress')}
              </button>
              <button className="cascade-btn cascade-btn-cancel" onClick={handleCancelCascade}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
