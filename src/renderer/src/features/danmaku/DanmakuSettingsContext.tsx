import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DEFAULT_DANMAKU_SETTINGS,
  loadDanmakuSettings,
  parseDanmakuSettings,
  saveDanmakuSettings,
} from './danmakuSettings';
import type { DanmakuSettings } from './danmakuSettings';

interface DanmakuSettingsContextValue {
  settings: DanmakuSettings;
  update: (patch: Partial<DanmakuSettings>) => void;
  reset: () => void;
  clearToken: number;
  clearAll: () => void;
}

const DanmakuSettingsContext = createContext<DanmakuSettingsContextValue | null>(null);

export function DanmakuSettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<DanmakuSettings>(loadDanmakuSettings);
  const [clearToken, setClearToken] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => saveDanmakuSettings(settings), 150);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const update = useCallback((patch: Partial<DanmakuSettings>): void => {
    setSettings((current) => parseDanmakuSettings({ ...current, ...patch }));
  }, []);

  const clearAll = useCallback((): void => {
    setClearToken((token) => token + 1);
  }, []);

  const reset = useCallback((): void => {
    setSettings({ ...DEFAULT_DANMAKU_SETTINGS });
    setClearToken((token) => token + 1);
  }, []);

  const value = useMemo(
    () => ({ settings, update, reset, clearToken, clearAll }),
    [settings, update, reset, clearToken, clearAll],
  );

  return (
    <DanmakuSettingsContext.Provider value={value}>{children}</DanmakuSettingsContext.Provider>
  );
}

export function useDanmakuSettings(): DanmakuSettingsContextValue {
  const value = useContext(DanmakuSettingsContext);
  if (!value) throw new Error('useDanmakuSettings must be used inside DanmakuSettingsProvider');
  return value;
}
