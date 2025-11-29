/**
 * Data Ingestion Service
 * Parses all JSON files from arcraiders-data and builds a queryable database
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  Bot,
  CraftingUse,
  DroppedBy,
  EnrichedItem,
  HideoutStation,
  HideoutUse,
  Item,
  ObtainedFrom,
  Quest,
  QuestRelation,
  Trade,
  TradeInfo,
} from '../../shared/types';

export class DataService {
  private items: Map<string, Item> = new Map();
  private quests: Map<string, Quest> = new Map();
  private trades: Trade[] = [];
  private hideoutStations: Map<string, HideoutStation> = new Map();
  private bots: Map<string, Bot> = new Map();
  private enrichedItems: Map<string, EnrichedItem> = new Map();
  private dataPath: string;
  private isLoaded = false;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  /**
   * Initialize and load all data
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    console.log('[DataService] Starting data ingestion...');
    const startTime = Date.now();

    try {
      // Load all data types
      await this.loadItems();
      await this.loadQuests();
      await this.loadTrades();
      await this.loadHideoutStations();
      await this.loadBots();

      // Build enriched items with relationships
      this.buildEnrichedItems();

      this.isLoaded = true;
      console.log(`[DataService] Data ingestion complete in ${Date.now() - startTime}ms`);
      console.log(`[DataService] Loaded ${this.items.size} items`);
      console.log(`[DataService] Loaded ${this.quests.size} quests`);
      console.log(`[DataService] Loaded ${this.trades.length} trades`);
      console.log(`[DataService] Loaded ${this.hideoutStations.size} hideout stations`);
      console.log(`[DataService] Loaded ${this.bots.size} bots`);
    } catch (error) {
      console.error('[DataService] Error during data ingestion:', error);
      throw error;
    }
  }

  /**
   * Load all item JSON files
   */
  private async loadItems(): Promise<void> {
    const itemsPath = join(this.dataPath, 'items');
    try {
      const files = readdirSync(itemsPath).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const content = readFileSync(join(itemsPath, file), 'utf-8');
          const item: Item = JSON.parse(content);
          this.items.set(item.id, item);
        } catch (err) {
          console.warn(`[DataService] Failed to parse item file: ${file}`, err);
        }
      }
    } catch (err) {
      console.error('[DataService] Failed to read items directory:', err);
    }
  }

  /**
   * Load all quest JSON files
   */
  private async loadQuests(): Promise<void> {
    const questsPath = join(this.dataPath, 'quests');
    try {
      const files = readdirSync(questsPath).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const content = readFileSync(join(questsPath, file), 'utf-8');
          const quest: Quest = JSON.parse(content);
          this.quests.set(quest.id, quest);
        } catch (err) {
          console.warn(`[DataService] Failed to parse quest file: ${file}`, err);
        }
      }
    } catch (err) {
      console.error('[DataService] Failed to read quests directory:', err);
    }
  }

  /**
   * Load trades from trades.json
   */
  private async loadTrades(): Promise<void> {
    const tradesPath = join(this.dataPath, 'trades.json');
    try {
      const content = readFileSync(tradesPath, 'utf-8');
      this.trades = JSON.parse(content);
    } catch (err) {
      console.error('[DataService] Failed to load trades:', err);
    }
  }

  /**
   * Load hideout station data
   */
  private async loadHideoutStations(): Promise<void> {
    const hideoutPath = join(this.dataPath, 'hideout');
    try {
      const files = readdirSync(hideoutPath).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const content = readFileSync(join(hideoutPath, file), 'utf-8');
          const station: HideoutStation = JSON.parse(content);
          this.hideoutStations.set(station.id, station);
        } catch (err) {
          console.warn(`[DataService] Failed to parse hideout file: ${file}`, err);
        }
      }
    } catch (err) {
      console.error('[DataService] Failed to read hideout directory:', err);
    }
  }

  /**
   * Load bots from bots.json
   */
  private async loadBots(): Promise<void> {
    const botsPath = join(this.dataPath, 'bots.json');
    try {
      const content = readFileSync(botsPath, 'utf-8');
      const botsArray: Bot[] = JSON.parse(content);
      for (const bot of botsArray) {
        this.bots.set(bot.id, bot);
      }
    } catch (err) {
      console.error('[DataService] Failed to load bots:', err);
    }
  }

  /**
   * Build enriched items with all relationships
   */
  private buildEnrichedItems(): void {
    for (const [id, item] of this.items) {
      const enriched: EnrichedItem = {
        ...item,
        usedInCrafting: this.findCraftingUses(id),
        questRelations: this.findQuestRelations(id),
        trades: this.findTrades(id),
        hideoutUses: this.findHideoutUses(id),
        obtainedFrom: this.findObtainedFrom(id),
        droppedBy: this.findDroppedBy(id),
      };
      this.enrichedItems.set(id, enriched);
    }
  }

  /**
   * Find all items that use this item in crafting (as a recipe ingredient)
   */
  private findCraftingUses(itemId: string): CraftingUse[] {
    const uses: CraftingUse[] = [];

    // Check item recipes - find items that need this item as an ingredient
    for (const [, item] of this.items) {
      if (item.recipe && item.recipe[itemId]) {
        uses.push({
          itemId: item.id,
          itemName: item.name,
          quantityNeeded: item.recipe[itemId],
          station: item.craftBench?.[0] || 'Workbench',
        });
      }
    }

    return uses;
  }

  /**
   * Find all quests related to this item
   */
  private findQuestRelations(itemId: string): QuestRelation[] {
    const relations: QuestRelation[] = [];

    for (const [, quest] of this.quests) {
      // Check if item is a reward
      if (quest.rewardItemIds) {
        for (const reward of quest.rewardItemIds) {
          if (reward.itemId === itemId) {
            relations.push({
              questId: quest.id,
              questName: quest.name,
              trader: quest.trader,
              type: 'reward',
              quantity: reward.quantity,
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * Find all trades involving this item
   */
  private findTrades(itemId: string): TradeInfo[] {
    const tradeInfos: TradeInfo[] = [];

    for (const trade of this.trades) {
      // Item can be bought
      if (trade.itemId === itemId) {
        const costItem = this.items.get(trade.cost.itemId);
        tradeInfos.push({
          trader: trade.trader,
          type: 'buy',
          quantity: trade.quantity,
          cost: {
            itemId: trade.cost.itemId,
            itemName: costItem?.name || { en: trade.cost.itemId },
            quantity: trade.cost.quantity,
          },
          dailyLimit: trade.dailyLimit,
        });
      }

      // Item is used as payment
      if (trade.cost.itemId === itemId) {
        const receivedItem = this.items.get(trade.itemId);
        tradeInfos.push({
          trader: trade.trader,
          type: 'sell',
          quantity: trade.cost.quantity,
          cost: {
            itemId: trade.itemId,
            itemName: receivedItem?.name || { en: trade.itemId },
            quantity: trade.quantity,
          },
          dailyLimit: trade.dailyLimit,
        });
      }
    }

    return tradeInfos;
  }

  /**
   * Find all hideout upgrades requiring this item
   */
  private findHideoutUses(itemId: string): HideoutUse[] {
    const uses: HideoutUse[] = [];

    for (const [, station] of this.hideoutStations) {
      for (const level of station.levels) {
        for (const req of level.requirementItemIds) {
          if (req.itemId === itemId) {
            uses.push({
              stationId: station.id,
              stationName: station.name,
              level: level.level,
              quantityNeeded: req.quantity,
            });
          }
        }
      }
    }

    return uses;
  }

  /**
   * Find all items that produce this item when recycled or salvaged
   * This is the reverse of recyclesInto/salvagesInto
   */
  private findObtainedFrom(itemId: string): ObtainedFrom[] {
    const sources: ObtainedFrom[] = [];

    for (const [, item] of this.items) {
      // Check if recycling this item produces the target item
      if (item.recyclesInto && item.recyclesInto[itemId]) {
        sources.push({
          itemId: item.id,
          itemName: item.name,
          quantity: item.recyclesInto[itemId],
          method: 'recycle',
        });
      }

      // Check if salvaging this item produces the target item
      if (item.salvagesInto && item.salvagesInto[itemId]) {
        sources.push({
          itemId: item.id,
          itemName: item.name,
          quantity: item.salvagesInto[itemId],
          method: 'salvage',
        });
      }
    }

    return sources;
  }

  /**
   * Find all bots that drop this item
   */
  private findDroppedBy(itemId: string): DroppedBy[] {
    const droppedBy: DroppedBy[] = [];

    for (const [, bot] of this.bots) {
      if (bot.drops && bot.drops.includes(itemId)) {
        droppedBy.push({
          botId: bot.id,
          botName: bot.name,
          botImage: bot.image,
          threat: bot.threat,
        });
      }
    }

    return droppedBy;
  }

  /**
   * Get an enriched item by ID
   */
  getItem(itemId: string): EnrichedItem | undefined {
    return this.enrichedItems.get(itemId);
  }

  /**
   * Get all enriched items
   */
  getAllItems(): EnrichedItem[] {
    return Array.from(this.enrichedItems.values());
  }

  /**
   * Get all item names for fuzzy search
   */
  getItemNames(): Array<{ id: string; name: string }> {
    return Array.from(this.items.values()).map(item => ({
      id: item.id,
      name: item.name.en,
    }));
  }

  /**
   * Search items by name (exact match)
   */
  searchByName(name: string): EnrichedItem | undefined {
    const normalized = name.toLowerCase().trim();
    for (const [, item] of this.enrichedItems) {
      if (item.name.en.toLowerCase() === normalized) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Get basic item by ID (non-enriched)
   */
  getBasicItem(itemId: string): Item | undefined {
    return this.items.get(itemId);
  }

  /**
   * Check if data is loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get a bot by ID
   */
  getBot(botId: string): Bot | undefined {
    return this.bots.get(botId);
  }

  /**
   * Get all bots
   */
  getAllBots(): Bot[] {
    return Array.from(this.bots.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    items: number;
    quests: number;
    trades: number;
    hideoutStations: number;
    bots: number;
  } {
    return {
      items: this.items.size,
      quests: this.quests.size,
      trades: this.trades.length,
      hideoutStations: this.hideoutStations.size,
      bots: this.bots.size,
    };
  }
}
