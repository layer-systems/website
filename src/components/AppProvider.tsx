import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useNostrLogin } from '@nostrify/react/login';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata, type BlossomServerMetadata } from '@/contexts/AppContext';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

// Zod schema for RelayMetadata validation
const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
}) satisfies z.ZodType<RelayMetadata>;

// Zod schema for BlossomServerMetadata validation
const BlossomServerMetadataSchema = z.object({
  servers: z.array(z.url()),
  updatedAt: z.number(),
}) satisfies z.ZodType<BlossomServerMetadata>;

/** Config fields that belong to one account: its published relay and Blossom server lists. */
type AccountScopedKey = 'relayMetadata' | 'blossomServerMetadata';
const ACCOUNT_SCOPED_KEYS: readonly AccountScopedKey[] = ['relayMetadata', 'blossomServerMetadata'];

type AccountConfig = Partial<Pick<AppConfig, AccountScopedKey>>;

const AccountConfigSchema = z.object({
  relayMetadata: RelayMetadataSchema.optional(),
  blossomServerMetadata: BlossomServerMetadataSchema.optional(),
}) satisfies z.ZodType<AccountConfig>;

/**
 * What is persisted. Preferences are shared by every account on this device,
 * but relay and Blossom server lists are kept per pubkey (`accounts`), plus a
 * separate slot for signed-out browsing (`guest`), so one account's lists are
 * never read, used or re-signed by another account or after logout.
 */
interface StoredAppConfig extends Partial<Omit<AppConfig, AccountScopedKey>> {
  accounts?: Record<string, AccountConfig>;
  guest?: AccountConfig;
}

// Unknown keys are stripped, which also drops the pre-scoping top-level
// `relayMetadata`/`blossomServerMetadata`: nothing records whose they were.
const StoredAppConfigSchema = z.object({
  publishClientTag: z.boolean().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  useAppBlossomServers: z.boolean().optional(),
  accounts: z.record(z.string().regex(/^[0-9a-f]{64}$/), AccountConfigSchema).optional(),
  guest: AccountConfigSchema.optional(),
}) satisfies z.ZodType<StoredAppConfig>;

const storedConfigSerializer = {
  serialize: (value: StoredAppConfig) => JSON.stringify(value),
  deserialize: (value: string): StoredAppConfig => StoredAppConfigSchema.parse(JSON.parse(value)),
};

/** The flat config view for one account (or the guest slot when `pubkey` is undefined). */
function scopeStoredConfig(stored: StoredAppConfig, pubkey: string | undefined): Partial<AppConfig> {
  const { accounts, guest, ...shared } = stored;
  const scoped = pubkey ? accounts?.[pubkey] : guest;
  return { ...shared, ...scoped };
}

/** Writes a flat config view back, putting account-scoped fields in that account's slot only. */
function unscopeConfig(
  stored: StoredAppConfig,
  pubkey: string | undefined,
  view: Partial<AppConfig>,
): StoredAppConfig {
  const shared: StoredAppConfig = { ...view };
  const scoped: AccountConfig = {};
  for (const key of ACCOUNT_SCOPED_KEYS) {
    delete (shared as Partial<AppConfig>)[key];
    if (view[key] !== undefined) {
      Object.assign(scoped, { [key]: view[key] });
    }
  }
  if (!pubkey) {
    return { ...shared, accounts: stored.accounts, guest: scoped };
  }
  return { ...shared, accounts: { ...stored.accounts, [pubkey]: scoped }, guest: stored.guest };
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // The active account, as used by useCurrentUser (the first login).
  const { logins } = useNostrLogin();
  const pubkey = logins[0]?.pubkey;

  // App configuration state with localStorage persistence
  const [stored, setStored] = useLocalStorage<StoredAppConfig>(storageKey, {}, storedConfigSerializer);

  // Generic config updater with callback pattern. It is bound to the account
  // active when it was created, so a write that lands after an account switch
  // (e.g. a slow sync started for the previous account) stays in that
  // account's slot instead of leaking into the new one.
  const updateConfig = useCallback(
    (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
      setStored((prev) => unscopeConfig(prev, pubkey, updater(scopeStoredConfig(prev, pubkey))));
    },
    [setStored, pubkey],
  );

  const config = useMemo(
    () => ({ ...defaultConfig, ...scopeStoredConfig(stored, pubkey) }),
    [defaultConfig, stored, pubkey],
  );

  const appContextValue: AppContextType = useMemo(
    () => ({ config, updateConfig }),
    [config, updateConfig],
  );

  // Apply theme effects to document
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root
 */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Handle system theme changes when theme is set to "system"
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}