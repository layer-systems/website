import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FolderDialog } from './FolderDialog';
import type { Folder } from '@/os/folders';

const folders: Folder[] = [{ id: 'f1', name: 'Social' }];

function renderDialog(overrides: Partial<Parameters<typeof FolderDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <FolderDialog
      open
      folders={folders}
      onSubmit={onSubmit}
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('FolderDialog', () => {
  it('creates a folder with the normalized name', () => {
    const { onSubmit, onOpenChange } = renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  My   Tools  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith('My Tools');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an error when the name is empty', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Give the folder a name.');
  });

  it('shows an error for a duplicate name', () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'social' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
  });

  it('allows keeping the current name when renaming', () => {
    const { onSubmit } = renderDialog({ folder: folders[0] });
    expect(screen.getByLabelText('Name')).toHaveValue('Social');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onSubmit).toHaveBeenCalledWith('Social');
  });
});
