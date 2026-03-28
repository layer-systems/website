import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

// Fonts
import '@fontsource-variable/outfit';
import '@fontsource-variable/bitter';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
