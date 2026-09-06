import { useContext } from 'react';
import { WindowManagerContext, type WindowManagerContextType } from './WindowManagerContext';

export function useWindowManager(): WindowManagerContextType {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error('useWindowManager must be used within a WindowManagerProvider');
  }
  return context;
}
