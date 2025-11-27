/**
 * Overlay Entry Point
 */

import '../assets/speranza.css';
import '../i18n'; // Initialize i18next
import './overlay.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OverlayApp from './OverlayApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
