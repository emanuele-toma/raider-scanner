/**
 * ItemCard Component
 * Displays enriched item information in Speranza Terminal style
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedItem, LocalizedString } from '../../../../shared/types';
import { getLocalizedString } from '../../i18n';
import './ItemCard.css';

interface ItemCardProps {
  item: EnrichedItem;
  confidence?: number;
  onClose?: () => void;
  maxWidth?: number;
  appLanguage?: string;
  onNavigateToBot?: (botId: string) => void;
}

// Track which sections are expanded
interface ExpandedSections {
  crafting: boolean;
  quests: boolean;
  trades: boolean;
  hideout: boolean;
  obtainedFrom: boolean;
  droppedBy: boolean;
}

const DEFAULT_VISIBLE_ITEMS = 5;

function getRarityClass(rarity?: string): string {
  if (!rarity) return 'rarity-common';
  const lower = rarity.toLowerCase();
  if (lower.includes('legendary')) return 'rarity-legendary';
  if (lower.includes('epic')) return 'rarity-epic';
  if (lower.includes('rare')) return 'rarity-rare';
  if (lower.includes('uncommon')) return 'rarity-uncommon';
  return 'rarity-common';
}

function getRarityKey(rarity?: string): string {
  if (!rarity) return 'common';
  const lower = rarity.toLowerCase();
  if (lower.includes('legendary')) return 'legendary';
  if (lower.includes('epic')) return 'epic';
  if (lower.includes('rare')) return 'rare';
  if (lower.includes('uncommon')) return 'uncommon';
  return 'common';
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Cache for item names to avoid repeated lookups
const itemNameCache = new Map<string, LocalizedString>();

// Cache for item values (for recycle value calculation)
const itemValueCache = new Map<string, number>();

// Sell recommendation result
interface SellRecommendation {
  action: 'sell' | 'recycle' | 'none';
  sellValue: number;
  recycleValue: number;
  profit: number;
}

export default function ItemCard({
  item,
  confidence,
  onClose,
  maxWidth,
  appLanguage = 'en',
  onNavigateToBot,
}: ItemCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const rarityClass = getRarityClass(item.rarity);
  const [breakdownNames, setBreakdownNames] = useState<Record<string, LocalizedString>>({});
  const [expanded, setExpanded] = useState<ExpandedSections>({
    crafting: false,
    quests: false,
    trades: false,
    hideout: false,
    obtainedFrom: false,
    droppedBy: false,
  });
  const [sellRecommendation, setSellRecommendation] = useState<SellRecommendation | null>(null);

  // Toggle section expansion
  const toggleSection = (section: keyof ExpandedSections): void => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Get localized strings for item data
  const itemName = getLocalizedString(item.name, appLanguage);
  const itemDescription = getLocalizedString(item.description, appLanguage);

  // Translate rarity and type
  const translatedRarity = t(`rarity.${getRarityKey(item.rarity)}`);
  const translatedType = item.type ? t(`itemType.${item.type}`, { defaultValue: item.type }) : undefined;

  // Load item names for recycle/salvage breakdown
  useEffect(() => {
    const itemIds = new Set<string>();
    if (item.recyclesInto) {
      Object.keys(item.recyclesInto).forEach(id => itemIds.add(id));
    }
    if (item.salvagesInto) {
      Object.keys(item.salvagesInto).forEach(id => itemIds.add(id));
    }

    if (itemIds.size === 0) return;

    const loadNames = async (): Promise<void> => {
      const names: Record<string, LocalizedString> = {};

      for (const itemId of itemIds) {
        // Check cache first
        if (itemNameCache.has(itemId)) {
          names[itemId] = itemNameCache.get(itemId)!;
          continue;
        }

        try {
          const fetchedItem = (await window.api.getItem(itemId)) as { name?: LocalizedString } | null;
          if (fetchedItem?.name) {
            itemNameCache.set(itemId, fetchedItem.name);
            names[itemId] = fetchedItem.name;
          }
        } catch {
          // Item not found, will fall back to ID
        }
      }

      setBreakdownNames(names);
    };

    loadNames();
  }, [item.recyclesInto, item.salvagesInto]);

  // Calculate sell vs recycle recommendation
  useEffect(() => {
    // Only calculate if item has a value and recycles into something
    if (item.value === undefined || !item.recyclesInto || Object.keys(item.recyclesInto).length === 0) {
      setSellRecommendation(null);
      return;
    }

    const calculateRecycleValue = async (): Promise<void> => {
      let recycleTotal = 0;

      for (const [itemId, quantity] of Object.entries(item.recyclesInto!)) {
        // Check cache first
        if (itemValueCache.has(itemId)) {
          recycleTotal += itemValueCache.get(itemId)! * quantity;
          continue;
        }

        try {
          const fetchedItem = (await window.api.getItem(itemId)) as { value?: number } | null;
          if (fetchedItem?.value !== undefined) {
            itemValueCache.set(itemId, fetchedItem.value);
            recycleTotal += fetchedItem.value * quantity;
          }
        } catch {
          // Item not found or no value, skip
        }
      }

      const sellValue = item.value!;
      const profit = Math.abs(recycleTotal - sellValue);

      if (recycleTotal > sellValue) {
        setSellRecommendation({ action: 'recycle', sellValue, recycleValue: recycleTotal, profit });
      } else if (sellValue > recycleTotal) {
        setSellRecommendation({ action: 'sell', sellValue, recycleValue: recycleTotal, profit });
      } else {
        setSellRecommendation({ action: 'none', sellValue, recycleValue: recycleTotal, profit: 0 });
      }
    };

    calculateRecycleValue();
  }, [item.value, item.recyclesInto]);

  // Helper to get breakdown item name
  const getBreakdownItemName = (itemId: string): string => {
    const localizedName = breakdownNames[itemId];
    if (localizedName) {
      return getLocalizedString(localizedName, appLanguage);
    }
    // Fallback: format the ID nicely
    return itemId.replace(/_/g, ' ');
  };

  return (
    <div className="item-card" style={maxWidth ? { width: maxWidth } : undefined}>
      {/* Header */}
      <div className="item-card-header">
        <div className="item-card-title-row">
          <h2 className={`item-card-name ${rarityClass}`}>{itemName}</h2>
          {onClose && (
            <button className="item-card-close" onClick={onClose} title={t('common.close')}>
              ✕
            </button>
          )}
        </div>
        <div className="item-card-meta">
          <span className={`item-card-rarity ${rarityClass}`}>{translatedRarity}</span>
          {translatedType && <span className="item-card-type">{translatedType}</span>}
          {confidence !== undefined && (
            <span className="item-card-confidence">
              {t('itemCard.match', { percent: Math.round(confidence * 100) })}
            </span>
          )}
        </div>
      </div>

      {/* Image */}
      {item.imageFilename && (
        <div className="item-card-image-container">
          <img
            src={item.imageFilename}
            alt={itemName}
            className="item-card-image"
            onError={e => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Stats */}
      <div className="item-card-stats">
        {item.value !== undefined && (
          <div className="item-stat">
            <span className="item-stat-label">{t('itemCard.value')}</span>
            <span className="item-stat-value text-cyan">{formatNumber(item.value)} ₵</span>
          </div>
        )}
        {item.weightKg !== undefined && (
          <div className="item-stat">
            <span className="item-stat-label">{t('itemCard.weight')}</span>
            <span className="item-stat-value">{item.weightKg} kg</span>
          </div>
        )}
        {item.stackSize !== undefined && (
          <div className="item-stat">
            <span className="item-stat-label">{t('itemCard.stack')}</span>
            <span className="item-stat-value">{item.stackSize}</span>
          </div>
        )}
      </div>

      {/* Sell Recommendation */}
      {sellRecommendation && sellRecommendation.action !== 'none' && sellRecommendation.profit > 0 && (
        <div className={`sell-recommendation sell-recommendation-${sellRecommendation.action}`}>
          <span className="sell-recommendation-icon">{sellRecommendation.action === 'recycle' ? '♻️' : '💰'}</span>
          <div className="sell-recommendation-content">
            <span className="sell-recommendation-title">
              {sellRecommendation.action === 'recycle' ? t('itemCard.recommendRecycle') : t('itemCard.recommendSell')}
            </span>
            <span className="sell-recommendation-detail">
              {t('itemCard.profitAmount', { amount: formatNumber(sellRecommendation.profit) })}
              {' • '}
              {sellRecommendation.action === 'recycle'
                ? t('itemCard.recycleWorth', { amount: formatNumber(sellRecommendation.recycleValue) })
                : t('itemCard.sellWorth', { amount: formatNumber(sellRecommendation.sellValue) })}
            </span>
          </div>
        </div>
      )}

      {/* Description */}
      {itemDescription && (
        <div className="item-card-description">
          <p>{itemDescription}</p>
        </div>
      )}

      {/* Crafting Uses */}
      {item.usedInCrafting && item.usedInCrafting.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">🔧</span>
            {t('itemCard.usedInCrafting')}
          </h3>
          <ul className="section-list">
            {(expanded.crafting ? item.usedInCrafting : item.usedInCrafting.slice(0, DEFAULT_VISIBLE_ITEMS)).map(
              (use, i) => (
                <li key={i} className="section-list-item">
                  <span className="list-item-name">{getLocalizedString(use.itemName, appLanguage)}</span>
                  <span className="list-item-detail">x{use.quantityNeeded}</span>
                </li>
              ),
            )}
            {item.usedInCrafting.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('crafting')}>
                {expanded.crafting
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.usedInCrafting.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Quest Relations */}
      {item.questRelations && item.questRelations.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">📋</span>
            {t('itemCard.questRequirements')}
          </h3>
          <ul className="section-list">
            {(expanded.quests ? item.questRelations : item.questRelations.slice(0, DEFAULT_VISIBLE_ITEMS)).map(
              (quest, i) => (
                <li key={i} className="section-list-item">
                  <span className="list-item-name">{getLocalizedString(quest.questName, appLanguage)}</span>
                  <span className="list-item-detail">
                    {quest.trader} • {quest.type}
                    {quest.quantity && ` x${quest.quantity}`}
                  </span>
                </li>
              ),
            )}
            {item.questRelations.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('quests')}>
                {expanded.quests
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.questRelations.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Trades */}
      {item.trades && item.trades.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">💰</span>
            {t('itemCard.trades')}
          </h3>
          <ul className="section-list">
            {(expanded.trades ? item.trades : item.trades.slice(0, DEFAULT_VISIBLE_ITEMS)).map((trade, i) => (
              <li key={i} className="section-list-item">
                <span className="list-item-name">{trade.trader}</span>
                <span className="list-item-detail">
                  {trade.type === 'buy' ? t('itemCard.buy') : t('itemCard.sell')} x{trade.quantity}
                  {trade.cost &&
                    ` ${t('itemCard.for')} ${trade.cost.quantity}x ${getLocalizedString(trade.cost.itemName, appLanguage)}`}
                  {trade.dailyLimit && ` (${trade.dailyLimit}${t('itemCard.perDay')})`}
                </span>
              </li>
            ))}
            {item.trades.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('trades')}>
                {expanded.trades
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.trades.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Hideout Uses */}
      {item.hideoutUses && item.hideoutUses.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">🏠</span>
            {t('itemCard.hideoutUpgrades')}
          </h3>
          <ul className="section-list">
            {(expanded.hideout ? item.hideoutUses : item.hideoutUses.slice(0, DEFAULT_VISIBLE_ITEMS)).map((use, i) => (
              <li key={i} className="section-list-item">
                <span className="list-item-name">{getLocalizedString(use.stationName, appLanguage)}</span>
                <span className="list-item-detail">
                  {t('itemCard.level')} {use.level} • x{use.quantityNeeded}
                </span>
              </li>
            ))}
            {item.hideoutUses.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('hideout')}>
                {expanded.hideout
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.hideoutUses.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Recycle/Salvage Info */}
      {(item.recyclesInto || item.salvagesInto) && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">♻️</span>
            {t('itemCard.breakdown')}
          </h3>
          <div className="breakdown-grid">
            {item.recyclesInto && (
              <div className="breakdown-col">
                <span className="breakdown-label">{t('itemCard.recycle')}</span>
                {Object.entries(item.recyclesInto).map(([itemId, qty]) => (
                  <span key={itemId} className="breakdown-item">
                    {getBreakdownItemName(itemId)}: {qty}
                  </span>
                ))}
              </div>
            )}
            {item.salvagesInto && (
              <div className="breakdown-col">
                <span className="breakdown-label">{t('itemCard.salvage')}</span>
                {Object.entries(item.salvagesInto).map(([itemId, qty]) => (
                  <span key={itemId} className="breakdown-item">
                    {getBreakdownItemName(itemId)}: {qty}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Obtained From (reverse breakdown) */}
      {item.obtainedFrom && item.obtainedFrom.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">📦</span>
            {t('itemCard.obtainedFrom')}
          </h3>
          <ul className="section-list">
            {(expanded.obtainedFrom ? item.obtainedFrom : item.obtainedFrom.slice(0, DEFAULT_VISIBLE_ITEMS)).map(
              (source, i) => (
                <li key={i} className="section-list-item">
                  <span className="list-item-name">{getLocalizedString(source.itemName, appLanguage)}</span>
                  <span className="list-item-detail">
                    {source.method === 'recycle' ? t('itemCard.recycle') : t('itemCard.salvage')} • x{source.quantity}
                  </span>
                </li>
              ),
            )}
            {item.obtainedFrom.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('obtainedFrom')}>
                {expanded.obtainedFrom
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.obtainedFrom.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Dropped By ARCs */}
      {item.droppedBy && item.droppedBy.length > 0 && (
        <div className="item-card-section">
          <h3 className="section-title">
            <span className="section-icon">🤖</span>
            {t('itemCard.droppedBy')}
          </h3>
          <ul className="section-list">
            {(expanded.droppedBy ? item.droppedBy : item.droppedBy.slice(0, DEFAULT_VISIBLE_ITEMS)).map((arc, i) => (
              <li key={i} className="section-list-item">
                {onNavigateToBot ? (
                  <button className="list-item-link" onClick={() => onNavigateToBot(arc.botId)}>
                    {arc.botName}
                  </button>
                ) : (
                  <span className="list-item-name">{arc.botName}</span>
                )}
                <span className={`list-item-threat threat-${arc.threat.toLowerCase()}`}>{arc.threat}</span>
              </li>
            ))}
            {item.droppedBy.length > DEFAULT_VISIBLE_ITEMS && (
              <li className="section-list-more" onClick={() => toggleSection('droppedBy')}>
                {expanded.droppedBy
                  ? t('itemCard.showLess')
                  : t('itemCard.more', { count: item.droppedBy.length - DEFAULT_VISIBLE_ITEMS })}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Found In */}
      {item.foundIn && (
        <div className="item-card-footer">
          <span className="found-in-label">{t('itemCard.foundIn')}</span>
          <span className="found-in-value">{item.foundIn}</span>
        </div>
      )}
    </div>
  );
}
