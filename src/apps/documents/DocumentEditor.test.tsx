import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocumentEditor } from './DocumentEditor';
import { TestApp } from '@/test/TestApp';
import type { DocumentMeta } from '@/lib/documents/types';

function meta(overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: 'doc-test-1',
    title: 'Test document',
    createdAt: 0,
    updatedAt: 0,
    savedAt: 0,
    role: 'owner',
    archived: false,
    attachments: [],
    ...overrides,
  };
}

describe('DocumentEditor', () => {
  it('mounts the editor under Strict Mode without crashing', async () => {
    render(
      <StrictMode>
        <TestApp>
          <DocumentEditor
            meta={meta()}
            onRename={() => {}}
            onDelete={() => {}}
            onUpdateMeta={() => {}}
          />
        </TestApp>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(document.querySelector('.doc-editor')).toBeInTheDocument();
    });
  });

  it('shows the title, role and formatting toolbar', async () => {
    render(
      <TestApp>
        <DocumentEditor
          meta={meta()}
          onRename={() => {}}
          onDelete={() => {}}
          onUpdateMeta={() => {}}
        />
      </TestApp>,
    );

    await waitFor(() => {
      expect(screen.getByTitle('Rename document')).toHaveTextContent('Test document');
    });
    expect(screen.getByRole('toolbar', { name: 'Formatting', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();

    // The editor surface is the labelled, editable document body.
    await waitFor(() => {
      const region = document.querySelector('.doc-editor');
      expect(region).toHaveAttribute('contenteditable', 'true');
    });
  });

  it('disables editing affordances for a viewer', async () => {
    render(
      <TestApp>
        <DocumentEditor
          meta={meta({ role: 'viewer' })}
          onRename={() => {}}
          onDelete={() => {}}
          onUpdateMeta={() => {}}
        />
      </TestApp>,
    );

    // The editor mounts read-only for a viewer.
    await waitFor(() => {
      const region = document.querySelector('.doc-editor');
      expect(region).toHaveAttribute('contenteditable', 'false');
    });

    // Viewers cannot publish or rename.
    expect(screen.queryByRole('button', { name: /publish/i, hidden: true })).not.toBeInTheDocument();
    expect(screen.getByTitle(/renaming is unavailable/i)).toBeDisabled();
    expect(screen.getByTitle(/bold/i)).toBeDisabled();
  });
});
