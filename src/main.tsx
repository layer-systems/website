import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

// Brand fonts: Inter for body copy, JetBrains Mono as the display/data face
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
