/**
 * Update Notification Component
 * Beautiful UI for app updates with download progress
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateState } from '../../../../shared/types';
import './UpdateNotification.css';

export function UpdateNotification(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const cleanup = window.api.onUpdateStatus(state => {
      setUpdateState(state);
      // Show notification when update is available, downloading, or downloaded
      if (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') {
        setIsVisible(true);
        setIsMinimized(false);
      } else if (state.status === 'idle' || state.status === 'not-available') {
        setIsVisible(false);
      }
    });

    return cleanup;
  }, []);

  const handleDownload = useCallback(() => {
    window.api.downloadUpdate();
  }, []);

  const handleInstall = useCallback(() => {
    window.api.installUpdate();
  }, []);

  const handleSkip = useCallback(() => {
    if (updateState.info?.version) {
      window.api.skipUpdate(updateState.info.version);
      setIsVisible(false);
    }
  }, [updateState.info?.version]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const handleExpand = useCallback(() => {
    setIsMinimized(false);
  }, []);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format download speed
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  if (!isVisible) return null;

  // Minimized pill view
  if (isMinimized) {
    return (
      <button className="update-pill" onClick={handleExpand}>
        <span className="update-pill-icon">
          {updateState.status === 'downloading' ? (
            <svg className="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : updateState.status === 'downloaded' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </span>
        <span className="update-pill-text">
          {updateState.status === 'downloading'
            ? `${Math.round(updateState.progress?.percent || 0)}%`
            : updateState.status === 'downloaded'
              ? t('update.readyToInstall')
              : t('update.available')}
        </span>
        {updateState.status === 'downloading' && updateState.progress && (
          <span className="update-pill-progress" style={{ width: `${updateState.progress.percent}%` }} />
        )}
      </button>
    );
  }

  return (
    <div className="update-notification">
      {/* Header */}
      <div className="update-header">
        <div className="update-icon">
          {updateState.status === 'downloading' ? (
            <svg className="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : updateState.status === 'downloaded' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : updateState.status === 'error' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </div>
        <div className="update-title-section">
          <h3 className="update-title">
            {updateState.status === 'downloading'
              ? t('update.downloading')
              : updateState.status === 'downloaded'
                ? t('update.readyToInstall')
                : updateState.status === 'error'
                  ? t('update.error')
                  : t('update.available')}
          </h3>
          {updateState.info?.version && <span className="update-version">v{updateState.info.version}</span>}
        </div>
        <button className="update-minimize-btn" onClick={handleMinimize} title={t('update.minimize')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>

      {/* Progress bar for downloading */}
      {updateState.status === 'downloading' && updateState.progress && (
        <div className="update-progress-section">
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${updateState.progress.percent}%` }} />
          </div>
          <div className="update-progress-info">
            <span className="update-progress-percent">{Math.round(updateState.progress.percent)}%</span>
            <span className="update-progress-details">
              {formatBytes(updateState.progress.transferred)} / {formatBytes(updateState.progress.total)}
              <span className="update-speed">• {formatSpeed(updateState.progress.bytesPerSecond)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {updateState.status === 'error' && updateState.error && (
        <div className="update-error-message">
          <p>{updateState.error}</p>
        </div>
      )}

      {/* Release notes preview */}
      {updateState.info?.releaseNotes && updateState.status !== 'downloading' && (
        <div className="update-release-notes">
          <p className="release-notes-label">{t('update.whatsNew')}</p>
          <div className="release-notes-content">
            {updateState.info.releaseNotes.slice(0, 200)}
            {updateState.info.releaseNotes.length > 200 && '...'}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="update-actions">
        {updateState.status === 'available' && (
          <>
            <button className="update-btn update-btn-secondary" onClick={handleSkip}>
              {t('update.skipVersion')}
            </button>
            <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
              {t('update.later')}
            </button>
            <button className="update-btn update-btn-primary" onClick={handleDownload}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('update.download')}
            </button>
          </>
        )}

        {updateState.status === 'downloading' && (
          <button className="update-btn update-btn-secondary" onClick={handleMinimize}>
            {t('update.minimize')}
          </button>
        )}

        {updateState.status === 'downloaded' && (
          <>
            <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
              {t('update.later')}
            </button>
            <button className="update-btn update-btn-primary update-btn-install" onClick={handleInstall}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('update.installRestart')}
            </button>
          </>
        )}

        {updateState.status === 'error' && (
          <>
            <button className="update-btn update-btn-secondary" onClick={handleDismiss}>
              {t('update.dismiss')}
            </button>
            <button className="update-btn update-btn-primary" onClick={() => window.api.checkForUpdates()}>
              {t('update.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
