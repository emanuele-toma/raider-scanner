/**
 * Overlay App
 * Transparent overlay window for displaying scan results (non-interactive)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, ScanResult } from '../../../shared/types';
import { ItemCard } from '../components/ItemCard';
import { changeLanguage } from '../i18n';
import './overlay.css';

function OverlayApp(): React.JSX.Element {
  const { t } = useTranslation();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [countdown, setCountdown] = useState<number>(100);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [completedQuests, setCompletedQuests] = useState<Set<string>>(new Set());
  const [inProgressQuests, setInProgressQuests] = useState<Set<string>>(new Set());
  const [stationLevels, setStationLevels] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs to avoid stale closures in callbacks
  const countdownValueRef = useRef<number>(100);
  const settingsRef = useRef<AppSettings | null>(null);
  const isPausedRef = useRef<boolean>(false);

  // Keep refs in sync with state
  useEffect(() => {
    countdownValueRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Clear any running interval
  const clearCountdownInterval = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Start countdown timer
  const startCountdown = useCallback(
    (duration: number) => {
      // Clear any existing countdown
      clearCountdownInterval();

      // Reset state
      setCountdown(100);
      countdownValueRef.current = 100;
      setIsPaused(false);
      isPausedRef.current = false;

      const startTime = Date.now();

      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setCountdown(remaining);
        countdownValueRef.current = remaining;

        if (remaining <= 0) {
          clearCountdownInterval();
        }
      }, 50);
    },
    [clearCountdownInterval],
  );

  // Toggle countdown timer (pause/resume)
  const toggleCountdown = useCallback(() => {
    const currentSettings = settingsRef.current;
    const currentCountdown = countdownValueRef.current;
    const currentlyPaused = isPausedRef.current;

    if (currentlyPaused) {
      // Resume: restart countdown from current position
      if (currentSettings && currentCountdown > 0) {
        clearCountdownInterval();

        const remainingTime = (currentCountdown / 100) * currentSettings.autoHideDelay;
        const startTime = Date.now();
        const startCountdownValue = currentCountdown;

        countdownRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, startCountdownValue - (elapsed / remainingTime) * startCountdownValue);
          setCountdown(remaining);
          countdownValueRef.current = remaining;

          if (remaining <= 0) {
            clearCountdownInterval();
          }
        }, 50);
      }
      setIsPaused(false);
      isPausedRef.current = false;
      console.log('[Overlay] Timer resumed');
    } else {
      // Pause: stop the countdown
      clearCountdownInterval();
      setIsPaused(true);
      isPausedRef.current = true;
      console.log('[Overlay] Timer paused');
    }
  }, [clearCountdownInterval]);

  // Listen for toggle timer event - stable callback, no dependencies on changing values
  useEffect(() => {
    const cleanup = window.api.onOverlayPauseTimer(() => {
      console.log('[Overlay] Toggle timer event received');
      toggleCountdown();
    });
    return cleanup;
  }, [toggleCountdown]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Resize window to fit content
  const resizeWindow = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Add small padding for safety
      const width = Math.ceil(rect.width) + 4;
      const height = Math.ceil(rect.height) + 4;
      window.api.resizeOverlay?.(width, height);
    }
  }, []);

  // Listen for scan results and reload settings each time
  useEffect(() => {
    const cleanup = window.api.onScanResult(async (result: ScanResult) => {
      console.log('[Overlay] Received scan result:', result);
      // Reload settings and quest states, then set result
      const [newSettings, completed, inProgress, levels] = await Promise.all([
        window.api.getSettings(),
        window.api.getCompletedQuests(),
        window.api.getInProgressQuests(),
        window.api.getStationLevels(),
      ]);
      console.log('[Overlay] Loaded settings:', newSettings);

      // Update i18next language to match app language
      changeLanguage(newSettings.appLanguage);

      setSettings(newSettings);
      setCompletedQuests(new Set(completed));
      setInProgressQuests(new Set(inProgress));
      setStationLevels(levels as Record<string, number>);
      setScanResult(result);
      // Start countdown based on autoHideDelay
      startCountdown(newSettings.autoHideDelay);
    });

    return cleanup;
  }, [startCountdown]);

  // Resize window when content or settings change
  useEffect(() => {
    if (!scanResult || !settings) return;

    // Small delay to let content render with new settings
    const timer = setTimeout(resizeWindow, 100);
    return () => clearTimeout(timer);
  }, [scanResult, settings, resizeWindow]);

  // Don't render anything if no result
  if (!scanResult) {
    return <div className="overlay-container overlay-empty" />;
  }

  const overlayWidth = settings?.overlayWidth ?? 480;
  const showCrt = settings?.crtEffect ?? true;
  const appLanguage = settings?.appLanguage ?? 'en';

  return (
    <div className="overlay-container" ref={containerRef}>
      {/* Content */}
      <div className="overlay-content" style={{ maxWidth: overlayWidth }}>
        {scanResult.success && scanResult.matchedItem ? (
          <div className="border-progress-wrapper">
            {/* Border progress indicator */}
            <div
              className={`border-progress ${isPaused ? 'paused' : ''}`}
              style={{ '--progress': countdown } as React.CSSProperties}
            />
            <div className="overlay-card-wrapper">
              <ItemCard
                item={scanResult.matchedItem}
                confidence={scanResult.confidence}
                maxWidth={overlayWidth}
                appLanguage={appLanguage}
                completedQuests={completedQuests}
                inProgressQuests={inProgressQuests}
                stationLevels={stationLevels}
              />
              {/* CRT Scanline effect - contained within card */}
              {showCrt && <div className="crt-scanlines" />}
            </div>
          </div>
        ) : (
          <div className="border-progress-wrapper">
            {/* Border progress indicator for error state too */}
            <div
              className={`border-progress ${isPaused ? 'paused' : ''}`}
              style={{ '--progress': countdown } as React.CSSProperties}
            />
            <div className="overlay-error">
              <div className="error-icon">⚠</div>
              <div className="error-title">{t('overlay.noMatchFound')}</div>
              {scanResult.ocrText && (
                <div className="error-ocr">
                  <span className="error-label">{t('overlay.detectedText')}</span>
                  <code className="error-text">{scanResult.ocrText}</code>
                </div>
              )}
              {scanResult.error && <div className="error-message">{scanResult.error}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OverlayApp;
