import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { TestApp } from '@/test/TestApp';
import { Desktop, FOLDER_ID_PREFIX } from './Desktop';
import { WindowManagerProvider } from '@/os/WindowManagerProvider';
import { useLoginActions } from '@/hooks/useLoginActions';
import { folderStorageKey, loadFolderState } from '@/os/folders';
import { iconLayoutStorageKey } from '@/os/iconLayout';

function LoginProbe() {
  const actions = useLoginActions();
  return (
    <button data-testid="login-probe" onClick={() => actions.nsec(nip19.nsecEncode(generateSecretKey()))}>
      log in
    </button>
  );
}

// Radix Popper (context menus) constructs `new ResizeObserver(cb)`, which the
// vi.fn() mock in src/test/setup.ts does not support — same workaround as
// WallpaperSection.test.tsx.
beforeEach(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

async function renderDesktop(withLoginProbe = false) {
  const result = render(
    <TestApp>
      <WindowManagerProvider>
        <Desktop />
        {withLoginProbe && <LoginProbe />}
      </WindowManagerProvider>
    </TestApp>,
  );
  // NostrLoginProvider renders null while it reads logins from storage.
  await screen.findByRole('main');
  return result;
}

describe('Desktop folders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a folder around an app from the app context menu', async () => {
    await renderDesktop();

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Feed —/ }));
    const subTrigger = await screen.findByText('Move to folder');
    fireEvent.keyDown(subTrigger, { key: 'ArrowRight' });
    fireEvent.click(await screen.findByText('New folder with Feed…'));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Social' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(dialog).not.toBeInTheDocument();
    // The folder appears on the grid and the app icon leaves it.
    expect(await screen.findByRole('button', { name: /Social — folder with 1 app/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Feed —/ })).not.toBeInTheDocument();

    // The state persists under the anonymous user key (debounced save).
    await waitFor(() => expect(loadFolderState(null, ['feed']).folders).toHaveLength(1));
    const saved = loadFolderState(null, ['feed']);
    expect(saved.folders[0].name).toBe('Social');
    expect(saved.membership).toEqual({ feed: saved.folders[0].id });

    // Nudging the layout persists a grid slot for the folder entry.
    const folderIcon = screen.getByRole('button', { name: /Social — folder with 1 app/ });
    folderIcon.focus();
    fireEvent.keyDown(folderIcon, { key: ' ' });
    fireEvent.keyDown(folderIcon, { key: 'ArrowRight' });
    fireEvent.keyDown(folderIcon, { key: 'Enter' });

    await waitFor(() => {
      const layout = JSON.parse(localStorage.getItem(iconLayoutStorageKey) ?? '{}') as { desktop?: { id: string }[] };
      expect(layout.desktop?.some((slot) => slot.id === `${FOLDER_ID_PREFIX}${saved.folders[0].id}`)).toBe(true);
    });
  });

  it('opens a folder and moves an app back out of it', async () => {
    await renderDesktop();

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Feed —/ }));
    fireEvent.keyDown(await screen.findByText('Move to folder'), { key: 'ArrowRight' });
    fireEvent.click(await screen.findByText('New folder with Feed…'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Social' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    fireEvent.doubleClick(await screen.findByRole('button', { name: /Social — folder with 1 app/ }));
    expect(await screen.findByRole('dialog', { name: 'Folder Social' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Feed from Social' }));

    // The app is back on the grid, and the removal persists (debounced).
    expect(await screen.findByRole('button', { name: /^Feed —/ })).toBeInTheDocument();
    await waitFor(() => {
      const saved = loadFolderState(null, ['feed']);
      expect(saved.folders).toHaveLength(1);
      expect(saved.membership).toEqual({});
    });
  });

  it('deletes an empty folder from its context menu without confirmation', async () => {
    await renderDesktop();

    fireEvent.contextMenu(screen.getByRole('main'));
    fireEvent.click(await screen.findByText('New folder'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Empty one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const icon = await screen.findByRole('button', { name: /Empty one — folder with 0 apps/ });
    fireEvent.contextMenu(icon);
    fireEvent.click(await screen.findByText('Delete folder'));

    expect(screen.queryByRole('button', { name: /Empty one/ })).not.toBeInTheDocument();
    expect(loadFolderState(null, []).folders).toHaveLength(0);
  });

  it('loads folder state persisted under the user key', async () => {
    // Pre-seed the anonymous key; the signed-out desktop must pick it up.
    localStorage.setItem(
      folderStorageKey(null),
      JSON.stringify({
        version: 1,
        folders: [{ id: 'persisted', name: 'Kept' }],
        membership: { feed: 'persisted' },
      }),
    );
    await renderDesktop();
    expect(await screen.findByRole('button', { name: /Kept — folder with 1 app/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Feed —/ })).not.toBeInTheDocument();
  });

  it('switches to the signed-in user’s folders on login and keeps the anonymous ones', async () => {
    localStorage.setItem(
      folderStorageKey(null),
      JSON.stringify({
        version: 1,
        folders: [{ id: 'anon-f', name: 'Anon Folder' }],
        membership: { feed: 'anon-f' },
      }),
    );
    await renderDesktop(true);
    expect(await screen.findByRole('button', { name: /Anon Folder — folder with 1 app/ })).toBeInTheDocument();

    act(() => screen.getByTestId('login-probe').click());

    // The anonymous folder leaves the grid; the fresh user starts empty.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Anon Folder/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Feed —/ })).toBeInTheDocument();

    // The anonymous state survives under its own key.
    const anon = JSON.parse(localStorage.getItem(folderStorageKey(null)) ?? '{}') as { folders?: unknown[] };
    expect(anon.folders).toHaveLength(1);
  });
});
