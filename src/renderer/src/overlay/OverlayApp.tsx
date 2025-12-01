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
  const lastProcessedScanRef = useRef<number>(0); // Track which scan we've processed
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // RAF-based countdown refs
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(100);
  const isPausedRef = useRef<boolean>(false);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Start countdown timer using requestAnimationFrame
  const startCountdown = useCallback((duration: number) => {
    // Cancel any existing animation
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Reset state
    setCountdown(100);
    setIsPaused(false);
    isPausedRef.current = false;
    durationRef.current = duration;
    startTimeRef.current = performance.now();
    pausedAtRef.current = 100;

    const animate = (currentTime: number): void => {
      if (isPausedRef.current) {
        // Don't update while paused, but keep the RAF going
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const elapsed = currentTime - startTimeRef.current;
      const remaining = Math.max(0, pausedAtRef.current - (elapsed / durationRef.current) * 100);

      setCountdown(remaining);

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  // Toggle countdown timer (pause/resume)
  const toggleCountdown = useCallback(() => {
    if (isPausedRef.current) {
      // Resuming - reset start time and continue from current position
      startTimeRef.current = performance.now();
      isPausedRef.current = false;
      setIsPaused(false);
    } else {
      // Pausing - store current countdown value
      pausedAtRef.current = countdown;
      isPausedRef.current = true;
      setIsPaused(true);
    }
  }, [countdown]);

  // Listen for toggle timer event - stable callback, no dependencies on changing values
  useEffect(() => {
    const cleanup = window.api.onOverlayPauseTimer(() => {
      console.log('[Overlay] Toggle timer event received');
      toggleCountdown();
    });
    return cleanup;
  }, [toggleCountdown]);

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
    const cleanup = window.api.onScanResult(async (result: ScanResult & { _scanId?: number }) => {
      // Extract scan ID from result
      const scanId = result._scanId || Date.now();
      console.log('[Overlay] Received scan result:', result, 'scanId:', scanId);

      // Cancel any pending show timeout from previous scan
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }

      // Store the scanId for this request
      lastProcessedScanRef.current = scanId;

      // Reload settings and quest states
      const [newSettings, completed, inProgress, levels] = await Promise.all([
        window.api.getSettings(),
        window.api.getCompletedQuests(),
        window.api.getInProgressQuests(),
        window.api.getStationLevels(),
      ]);
      console.log('[Overlay] Loaded settings:', newSettings);

      // Update i18next language to match app language
      changeLanguage(newSettings.appLanguage);

      // Set all state together
      setSettings(newSettings);
      setCompletedQuests(new Set(completed));
      setInProgressQuests(new Set(inProgress));
      setStationLevels(levels as Record<string, number>);
      setScanResult(result);

      // After a short delay for render, resize and signal ready
      showTimeoutRef.current = setTimeout(() => {
        // Only proceed if this is still the current scan
        if (lastProcessedScanRef.current !== scanId) {
          console.log('[Overlay] Skipping stale scan:', scanId);
          return;
        }

        resizeWindow();

        // Signal main process to move window into view, passing scanId
        console.log('[Overlay] Signaling ready for scanId:', scanId);
        window.api.overlayReady(scanId);
        startCountdown(newSettings.autoHideDelay);
      }, 100);
    });

    return cleanup;
  }, [resizeWindow, startCountdown]);

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
