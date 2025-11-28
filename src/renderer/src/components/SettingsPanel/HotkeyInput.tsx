/**
 * Hotkey Input Component
 * Allows users to bind custom hotkeys by pressing key combinations
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './HotkeyInput.css';

interface HotkeyInputProps {
  value: string;
  onChange: (hotkey: string) => void;
  defaultValue?: string;
  disabled?: boolean;
}

// Keys that should not be used alone as hotkeys
const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'];

// Map browser key names to Electron accelerator format
const KEY_MAP: Record<string, string> = {
  Control: 'CommandOrControl',
  Meta: 'CommandOrControl',
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

// Keys that are not allowed in hotkeys
const BLOCKED_KEYS = ['Tab', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause', 'Insert', 'PrintScreen'];

export function HotkeyInput({ value, onChange, defaultValue, disabled }: HotkeyInputProps): React.JSX.Element {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<Set<string>>(new Set());
  const [displayValue, setDisplayValue] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  // Convert Electron accelerator to display format
  const formatHotkeyForDisplay = useCallback((hotkey: string): string => {
    return hotkey
      .replace(/CommandOrControl\+/g, 'Ctrl + ')
      .replace(/Shift\+/g, 'Shift + ')
      .replace(/Alt\+/g, 'Alt + ')
      .replace(/\+(?=[A-Z0-9])/g, ' + ');
  }, []);

  // Update display value when value prop changes
  useEffect(() => {
    setDisplayValue(formatHotkeyForDisplay(value));
  }, [value, formatHotkeyForDisplay]);

  // Convert key set to Electron accelerator format
  const keysToAccelerator = useCallback((keys: Set<string>): string => {
    const modifiers: string[] = [];
    let mainKey = '';

    keys.forEach(key => {
      if (key === 'Control' || key === 'Meta') {
        if (!modifiers.includes('CommandOrControl')) {
          modifiers.push('CommandOrControl');
        }
      } else if (key === 'Shift') {
        modifiers.push('Shift');
      } else if (key === 'Alt') {
        modifiers.push('Alt');
      } else {
        // Map special keys and uppercase letters
        mainKey = KEY_MAP[key] || key.toUpperCase();
      }
    });

    // Sort modifiers in consistent order: CommandOrControl, Shift, Alt
    modifiers.sort((a, b) => {
      const order = ['CommandOrControl', 'Shift', 'Alt'];
      return order.indexOf(a) - order.indexOf(b);
    });

    if (mainKey) {
      return [...modifiers, mainKey].join('+');
    }
    return '';
  }, []);

  // Format current keys for live display
  const formatCurrentKeys = useCallback(
    (keys: Set<string>): string => {
      const parts: string[] = [];

      if (keys.has('Control') || keys.has('Meta')) {
        parts.push('Ctrl');
      }
      if (keys.has('Shift')) {
        parts.push('Shift');
      }
      if (keys.has('Alt')) {
        parts.push('Alt');
      }

      keys.forEach(key => {
        if (!MODIFIER_KEYS.includes(key)) {
          parts.push((KEY_MAP[key] || key).toUpperCase());
        }
      });

      return parts.join(' + ') || t('settings.pressKeys');
    },
    [t],
  );

  // Finalize the hotkey after delay
  const finalizeHotkey = useCallback(() => {
    const keys = keysRef.current;
    const hasModifier = Array.from(keys).some(k => k === 'Control' || k === 'Meta' || k === 'Shift' || k === 'Alt');
    const hasMainKey = Array.from(keys).some(k => !MODIFIER_KEYS.includes(k));

    // Valid hotkey needs either a modifier+key combo or a function key
    const isFunctionKey = Array.from(keys).some(k => /^F\d+$/.test(k));

    if ((hasModifier && hasMainKey) || isFunctionKey) {
      const accelerator = keysToAccelerator(keys);
      if (accelerator) {
        onChange(accelerator);
        setDisplayValue(formatHotkeyForDisplay(accelerator));
      }
    }

    setIsRecording(false);
    setCurrentKeys(new Set());
    keysRef.current = new Set();
    // Notify main process to re-register hotkeys
    window.api.setHotkeyRecording(false);
  }, [keysToAccelerator, onChange, formatHotkeyForDisplay]);

  // Add/remove event listeners
  useEffect(() => {
    if (!isRecording) return undefined;

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      // Block certain keys
      if (BLOCKED_KEYS.includes(e.key)) {
        return;
      }

      // Cancel on Escape when no keys pressed
      if (e.key === 'Escape' && keysRef.current.size === 0) {
        setIsRecording(false);
        setCurrentKeys(new Set());
        keysRef.current = new Set();
        return;
      }

      // Add key to current set
      keysRef.current.add(e.key);
      setCurrentKeys(new Set(keysRef.current));

      // Clear previous timeout and set a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set timeout to finalize the hotkey after 500ms of no new keys
      timeoutRef.current = setTimeout(finalizeHotkey, 500);
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isRecording, finalizeHotkey]);

  // Handle click to start recording
  const handleClick = useCallback(() => {
    if (disabled) return;
    keysRef.current = new Set();
    setCurrentKeys(new Set());
    setIsRecording(true);
    // Notify main process to unregister hotkeys while recording
    window.api.setHotkeyRecording(true);
  }, [disabled]);

  // Handle blur to cancel recording
  const handleBlur = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsRecording(false);
    setCurrentKeys(new Set());
    keysRef.current = new Set();
    // Notify main process to re-register hotkeys
    window.api.setHotkeyRecording(false);
  }, []);

  // Handle reset to default
  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (defaultValue) {
        onChange(defaultValue);
      }
    },
    [defaultValue, onChange],
  );

  // Check if current value differs from default
  const showReset = defaultValue && value !== defaultValue;

  return (
    <div className="hotkey-input-wrapper">
      <button
        type="button"
        className={`hotkey-input ${isRecording ? 'recording' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleClick}
        onBlur={handleBlur}
        disabled={disabled}
      >
        <span className="hotkey-value">{isRecording ? formatCurrentKeys(currentKeys) : displayValue}</span>
        {isRecording && (
          <span className="hotkey-recording-indicator">
            <span className="recording-dot" />
          </span>
        )}
        {!isRecording && (
          <span className="hotkey-edit-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </span>
        )}
      </button>
      {showReset && (
        <button type="button" className="hotkey-reset-btn" onClick={handleReset} title={t('settings.resetToDefault')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      )}
    </div>
  );
}
