/**
 * Shared types for Raider Scanner
 * ARC Raiders Item Database Types
 */

// Localized string type
export interface LocalizedString {
  en: string;
  de?: string;
  fr?: string;
  es?: string;
  pt?: string;
  pl?: string;
  no?: string;
  da?: string;
  it?: string;
  ru?: string;
  ja?: string;
  'zh-TW'?: string;
  uk?: string;
  'zh-CN'?: string;
  kr?: string;
  tr?: string;
  hr?: string;
  sr?: string;
}

// Base item type
export interface Item {
  id: string;
  name: LocalizedString;
  description?: LocalizedString;
  type?: string;
  rarity?: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | string;
  imageFilename?: string;
  value?: number;
  recyclesInto?: Record<string, number>;
  salvagesInto?: Record<string, number>;
  recipe?: Record<string, number>;
  craftBench?: string[];
  foundIn?: string;
  stackSize?: number;
  weightKg?: number;
  updatedAt?: string;
}

// Recipe ingredient
export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

// Quest reward
export interface QuestReward {
  itemId: string;
  quantity: number;
}

// Quest type
export interface Quest {
  id: string;
  name: LocalizedString;
  description?: LocalizedString;
  trader: string;
  objectives?: LocalizedString[];
  requiredItemIds?: QuestReward[];
  grantedItemIds?: QuestReward[];
  rewardItemIds?: QuestReward[];
  otherRequirements?: string[];
  xp?: number;
  previousQuestIds?: string[];
  nextQuestIds?: string[];
  videoUrl?: string;
  updatedAt?: string;
}

// Trade type
export interface Trade {
  trader: string;
  itemId: string;
  quantity: number;
  cost: {
    itemId: string;
    quantity: number;
  };
  dailyLimit: number | null;
}

// Hideout level requirements
export interface HideoutLevelRequirement {
  level: number;
  requirementItemIds: RecipeIngredient[];
}

// Hideout station
export interface HideoutStation {
  id: string;
  name: LocalizedString;
  maxLevel: number;
  levels: HideoutLevelRequirement[];
}

// ARC Bot/Enemy type
export interface Bot {
  id: string;
  name: string;
  image: string;
  type: string;
  threat: string;
  description: string;
  weakness: string;
  maps: string[];
  destroyXp: number;
  lootXp: number;
  drops: string[];
}

// Enriched item with all relationships
export interface EnrichedItem extends Item {
  // Items this item is used to craft
  usedInCrafting: CraftingUse[];
  // Quests that require or reward this item
  questRelations: QuestRelation[];
  // Trade information
  trades: TradeInfo[];
  // Hideout upgrades requiring this item
  hideoutUses: HideoutUse[];
  // Items that produce this item when recycled/salvaged
  obtainedFrom: ObtainedFrom[];
  // ARCs that drop this item
  droppedBy: DroppedBy[];
}

// ARC that drops an item
export interface DroppedBy {
  botId: string;
  botName: string;
  botImage: string;
  threat: string;
}

export interface CraftingUse {
  itemId: string;
  itemName: LocalizedString;
  quantityNeeded: number;
  station?: string;
}

export interface QuestRelation {
  questId: string;
  questName: LocalizedString;
  trader: string;
  type: 'reward' | 'objective';
  quantity?: number;
}

export interface TradeInfo {
  trader: string;
  type: 'buy' | 'sell';
  quantity: number;
  cost?: {
    itemId: string;
    itemName: LocalizedString;
    quantity: number;
  };
  dailyLimit: number | null;
}

export interface HideoutUse {
  stationId: string;
  stationName: LocalizedString;
  level: number;
  quantityNeeded: number;
}

// Items that produce this item when recycled/salvaged
export interface ObtainedFrom {
  itemId: string;
  itemName: LocalizedString;
  quantity: number;
  method: 'recycle' | 'salvage';
}

// OCR Result
export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
}

// Scan Result sent to renderer
export interface ScanResult {
  success: boolean;
  ocrText?: string;
  matchedItem?: EnrichedItem;
  confidence?: number;
  error?: string;
  timestamp: number;
}

// Settings
export interface AppSettings {
  hotkey: string;
  closeOverlayHotkey: string;
  pauseTimerHotkey: string;
  scanRegionSize: number;
  appLanguage: string; // UI language for the app
  gameLanguage: string; // Language for OCR/search matching
  theme: 'dark' | 'light';
  overlayOpacity: number;
  overlayWidth: number;
  autoHideDelay: number;
  crtEffect: boolean;
}

// Calibration settings for tooltip detection
export interface CalibrationSettings {
  // Tooltip background color (RGB)
  tooltipColor: { r: number; g: number; b: number };
  colorTolerance: number;
  // Whether calibration has been completed
  isCalibrated: boolean;
}

// Calibration step data (simplified - only need color)
export type CalibrationStep = 'start' | 'pick-color' | 'complete';

export interface CalibrationState {
  step: CalibrationStep;
  tooltipColor?: { r: number; g: number; b: number };
}

// Update status types
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
}

export interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}

export interface UpdateState {
  status: UpdateStatus;
  info?: UpdateInfo;
  progress?: UpdateProgress;
  error?: string;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Main -> Renderer
  SCAN_RESULT: 'scan-result',
  OVERLAY_SHOW: 'overlay-show',
  OVERLAY_HIDE: 'overlay-hide',
  OVERLAY_PAUSE_TIMER: 'overlay-pause-timer',
  DATA_LOADED: 'data-loaded',
  CALIBRATION_UPDATE: 'calibration-update',
  UPDATE_STATUS: 'update-status',

  // Renderer -> Main
  REQUEST_SCAN: 'request-scan',
  UPDATE_SETTINGS: 'update-settings',
  GET_SETTINGS: 'get-settings',
  SEARCH_ITEM: 'search-item',
  SET_OVERLAY_INTERACTIVE: 'set-overlay-interactive',
  HIDE_OVERLAY: 'hide-overlay',
  OVERLAY_READY: 'overlay-ready',

  // Calibration
  START_CALIBRATION: 'start-calibration',
  CANCEL_CALIBRATION: 'cancel-calibration',
  GET_CALIBRATION: 'get-calibration',
  CALIBRATION_CAPTURE: 'calibration-capture',

  // Hotkey recording state (blocks hotkeys only during recording)
  SET_HOTKEY_RECORDING: 'set-hotkey-recording',

  // Updates
  CHECK_FOR_UPDATES: 'check-for-updates',
  DOWNLOAD_UPDATE: 'download-update',
  INSTALL_UPDATE: 'install-update',
  SKIP_UPDATE: 'skip-update',
  GET_SKIPPED_VERSION: 'get-skipped-version',
} as const;
