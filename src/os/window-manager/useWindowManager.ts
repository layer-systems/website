import { useContext } from 'react';
import { WindowManagerContext, type WindowManagerApi } from './context';

export function useWindowManager(): WindowManagerApi {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error('useWindowManager must be used within a WindowManagerProvider');
  }
  return context;
}
