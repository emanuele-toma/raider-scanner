/**
 * Calibration Panel Component
 * UI for starting and monitoring the calibration wizard
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalibrationSettings, CalibrationState } from '../../../../shared/types';
import './CalibrationPanel.css';

export function CalibrationPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [calibration, setCalibration] = useState<CalibrationSettings | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationState | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);

  useEffect(() => {
    // Load current calibration
    window.api.getCalibration().then(setCalibration);

    // Listen for calibration updates
    const unsubscribe = window.api.onCalibrationUpdate(state => {
      setCalibrationState(state);
      if (state.step === 'complete') {
        setIsCalibrating(false);
        // Reload calibration settings
        window.api.getCalibration().then(setCalibration);
      }
      // Note: We don't set isCalibrating=true on 'start' here
      // because 'start' is also sent when cancelling
    });

    return unsubscribe;
  }, []);

  const handleStartCalibration = (): void => {
    setIsCalibrating(true);
    window.api.startCalibration();
  };

  const handleCancelCalibration = (): void => {
    window.api.cancelCalibration();
    setIsCalibrating(false);
    setCalibrationState(null);
  };

  const getStepDescription = (step: string): string => {
    switch (step) {
      case 'start':
        return t('calibration.stepStart');
      case 'pick-color':
        return t('calibration.stepPickColor');
      case 'complete':
        return t('calibration.complete');
      default:
        return '';
    }
  };

  const formatColor = (color: { r: number; g: number; b: number }): string => {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  const formatHex = (color: { r: number; g: number; b: number }): string => {
    const toHex = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  };

  return (
    <div className="calibration-panel">
      {/* Header */}
      <div className="calibration-header">
        <div className="calibration-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <div className="calibration-header-text">
          <h3 className="calibration-title">{t('calibration.title')}</h3>
          <p className="calibration-subtitle">{t('calibration.hint')}</p>
        </div>
      </div>

      {/* Status Card */}
      {!isCalibrating && (
        <div className={`calibration-status-card ${calibration?.isCalibrated ? 'calibrated' : 'not-calibrated'}`}>
          <div className="status-badge">
            {calibration?.isCalibrated ? (
              <>
                <div className="status-badge-icon success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                </div>
                <span className="status-badge-text">{t('calibration.calibrated')}</span>
              </>
            ) : (
              <>
                <div className="status-badge-icon warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="status-badge-text">{t('calibration.notCalibrated')}</span>
              </>
            )}
          </div>

          {calibration?.isCalibrated && (
            <div className="color-display">
              <div className="color-swatch-container">
                <div className="color-swatch" style={{ backgroundColor: formatColor(calibration.tooltipColor) }}>
                  <div className="color-swatch-shine" />
                </div>
                <div className="color-ring" />
              </div>
              <div className="color-info">
                <span className="color-label">{t('calibration.color')}</span>
                <span className="color-hex">{formatHex(calibration.tooltipColor)}</span>
                <span className="color-rgb">{formatColor(calibration.tooltipColor)}</span>
              </div>
            </div>
          )}

          <button className="btn-calibrate" onClick={handleStartCalibration}>
            <span className="btn-icon">
              {calibration?.isCalibrated ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </span>
            <span className="btn-text">
              {calibration?.isCalibrated ? t('calibration.recalibrateBtn') : t('calibration.startBtn')}
            </span>
          </button>
        </div>
      )}

      {/* Calibration In Progress */}
      {isCalibrating && calibrationState && (
        <div className="calibration-wizard">
          {/* Progress Steps */}
          <div className="wizard-steps">
            <div className={`wizard-step ${calibrationState.step === 'start' ? 'active' : ''} ${calibrationState.step === 'pick-color' || calibrationState.step === 'complete' ? 'completed' : ''}`}>
              <div className="step-indicator">
                <span className="step-number">1</span>
                <div className="step-pulse" />
              </div>
              <span className="step-label">{t('calibration.stepCapture')}</span>
            </div>
            <div className="step-connector" />
            <div className={`wizard-step ${calibrationState.step === 'pick-color' ? 'active' : ''} ${calibrationState.step === 'complete' ? 'completed' : ''}`}>
              <div className="step-indicator">
                <span className="step-number">2</span>
                <div className="step-pulse" />
              </div>
              <span className="step-label">{t('calibration.stepPick')}</span>
            </div>
          </div>

          {/* Current Step Content */}
          <div className="wizard-content">
            {calibrationState.step === 'start' && (
              <div className="step-content">
                <div className="instruction-card">
                  <div className="instruction-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21,15 16,10 5,21" />
                    </svg>
                  </div>
                  <div className="instruction-text">
                    <p>{getStepDescription(calibrationState.step)}</p>
                  </div>
                </div>
                <div className="hotkey-instruction">
                  <span className="hotkey-label">{t('calibration.pressKey')}</span>
                  <div className="hotkey-badge">
                    <span>Ctrl</span>
                    <span className="hotkey-plus">+</span>
                    <span>P</span>
                  </div>
                </div>
              </div>
            )}

            {calibrationState.step === 'pick-color' && (
              <div className="step-content">
                <div className="instruction-card">
                  <div className="instruction-icon picking">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path d="M12 11v6m-3-3h6" />
                    </svg>
                  </div>
                  <div className="instruction-text">
                    <p>{getStepDescription(calibrationState.step)}</p>
                  </div>
                </div>
              </div>
            )}

            {calibrationState.tooltipColor && (
              <div className="preview-color">
                <div className="preview-swatch" style={{ backgroundColor: formatColor(calibrationState.tooltipColor) }} />
                <span className="preview-label">{t('calibration.selectedColor')}</span>
              </div>
            )}
          </div>

          {/* Cancel Button */}
          <button className="btn-cancel" onClick={handleCancelCalibration}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>{t('common.cancel')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
