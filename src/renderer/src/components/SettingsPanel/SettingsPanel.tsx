/**
 * Settings Panel Component
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '../../../../shared/types';
import { changeLanguage, GAME_LANGUAGES, SUPPORTED_LANGUAGES } from '../../i18n';
import { HotkeyInput } from './HotkeyInput';
import './SettingsPanel.css';

const OVERLAY_WIDTH_OPTIONS = [
  { value: 350, label: '350px (Compact)' },
  { value: 420, label: '420px (Small)' },
  { value: 480, label: '480px (Default)' },
  { value: 550, label: '550px (Wide)' },
  { value: 620, label: '620px (Extra Wide)' },
];

// Default hotkey values (must match main process defaults)
const DEFAULT_HOTKEYS = {
  hotkey: 'CommandOrControl+Shift+D',
  closeOverlayHotkey: 'CommandOrControl+Shift+C',
  pauseTimerHotkey: 'CommandOrControl+Shift+P',
};

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

export default function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const updated = await window.api.updateSettings(localSettings);
      onSettingsChange(updated);
      setHasChanges(false);

      // Update i18next language if app language changed
      if (updated.appLanguage !== settings.appLanguage) {
        changeLanguage(updated.appLanguage);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [localSettings, onSettingsChange, settings.appLanguage]);

  const handleReset = useCallback(() => {
    setLocalSettings(settings);
    setHasChanges(false);
  }, [settings]);

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="settings-title">⚙️ {t('settings.title')}</h2>
        {hasChanges && <span className="settings-unsaved">{t('settings.unsavedChanges')}</span>}
      </div>

      <div className="settings-content">
        {/* App Language Setting */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.appLanguage')}</span>
            <span className="label-hint">{t('settings.appLanguageHint')}</span>
          </label>
          <select
            className="setting-select"
            value={localSettings.appLanguage}
            onChange={e => handleChange('appLanguage', e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Game Language Setting */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.gameLanguage')}</span>
            <span className="label-hint">{t('settings.gameLanguageHint')}</span>
          </label>
          <select
            className="setting-select"
            value={localSettings.gameLanguage}
            onChange={e => handleChange('gameLanguage', e.target.value)}
          >
            {GAME_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Hotkey Setting */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.scanHotkey')}</span>
            <span className="label-hint">{t('settings.scanHotkeyHint')}</span>
          </label>
          <HotkeyInput
            value={localSettings.hotkey}
            onChange={value => handleChange('hotkey', value)}
            defaultValue={DEFAULT_HOTKEYS.hotkey}
          />
        </div>

        {/* Close Overlay Hotkey */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.closeOverlayHotkey')}</span>
            <span className="label-hint">{t('settings.closeOverlayHotkeyHint')}</span>
          </label>
          <HotkeyInput
            value={localSettings.closeOverlayHotkey}
            onChange={value => handleChange('closeOverlayHotkey', value)}
            defaultValue={DEFAULT_HOTKEYS.closeOverlayHotkey}
          />
        </div>

        {/* Pause Timer Hotkey */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.pauseTimerHotkey')}</span>
            <span className="label-hint">{t('settings.pauseTimerHotkeyHint')}</span>
          </label>
          <HotkeyInput
            value={localSettings.pauseTimerHotkey}
            onChange={value => handleChange('pauseTimerHotkey', value)}
            defaultValue={DEFAULT_HOTKEYS.pauseTimerHotkey}
          />
        </div>

        {/* Auto-hide Delay */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.autoHideDelay')}</span>
            <span className="label-hint">{t('settings.autoHideDelayHint')}</span>
          </label>
          <div className="setting-slider-container">
            <input
              type="range"
              className="setting-slider"
              min={1000}
              max={15000}
              step={500}
              value={localSettings.autoHideDelay}
              onChange={e => handleChange('autoHideDelay', parseInt(e.target.value))}
            />
            <span className="slider-value">{localSettings.autoHideDelay / 1000}s</span>
          </div>
        </div>

        {/* Overlay Opacity */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.overlayOpacity')}</span>
            <span className="label-hint">{t('settings.overlayOpacityHint')}</span>
          </label>
          <div className="setting-slider-container">
            <input
              type="range"
              className="setting-slider"
              min={0.5}
              max={1}
              step={0.05}
              value={localSettings.overlayOpacity}
              onChange={e => handleChange('overlayOpacity', parseFloat(e.target.value))}
            />
            <span className="slider-value">{Math.round(localSettings.overlayOpacity * 100)}%</span>
          </div>
        </div>

        {/* Overlay Width */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.overlayWidth')}</span>
            <span className="label-hint">{t('settings.overlayWidthHint')}</span>
          </label>
          <select
            className="setting-select"
            value={localSettings.overlayWidth}
            onChange={e => handleChange('overlayWidth', parseInt(e.target.value))}
          >
            {OVERLAY_WIDTH_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* CRT Effect */}
        <div className="setting-group">
          <label className="setting-label">
            <span className="label-text">{t('settings.crtEffect')}</span>
            <span className="label-hint">{t('settings.crtEffectHint')}</span>
          </label>
          <div className="setting-toggle">
            <input
              type="checkbox"
              id="crt-toggle"
              className="toggle-input"
              checked={localSettings.crtEffect}
              onChange={e => handleChange('crtEffect', e.target.checked)}
            />
            <label htmlFor="crt-toggle" className="toggle-label">
              <span className="toggle-switch" />
              <span className="toggle-text">
                {localSettings.crtEffect ? t('settings.enabled') : t('settings.disabled')}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="settings-actions">
        <button className="settings-btn settings-btn-secondary" onClick={handleReset} disabled={!hasChanges}>
          {t('settings.reset')}
        </button>
        <button className="settings-btn settings-btn-primary" onClick={handleSave} disabled={!hasChanges}>
          {t('settings.saveSettings')}
        </button>
      </div>
    </div>
  );
}
