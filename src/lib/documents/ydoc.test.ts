import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { openDocumentSession } from './ydoc';

// jsdom has no IndexedDB; the session must degrade to in-memory gracefully.

describe('openDocumentSession', () => {
  it('opens a document and fires onSynced', async () => {
    const onSynced = vi.fn();
    const session = openDocumentSession('test-doc', { onUpdate: () => {}, onSynced });
    await session.whenSynced;
    expect(onSynced).toHaveBeenCalledOnce();
    expect(session.doc).toBeInstanceOf(Y.Doc);
    session.destroy();
  });

  it('forwards updates', async () => {
    const onUpdate = vi.fn();
    const session = openDocumentSession('test-doc', { onUpdate, onSynced: () => {} });
    session.doc.getXmlFragment('default');
    session.doc.transact(() => {
      session.doc.getMap('meta').set('key', 'value');
    });
    expect(onUpdate).toHaveBeenCalled();
    session.destroy();
  });

  it('destroy is idempotent and stops callbacks', async () => {
    const onSynced = vi.fn();
    const session = openDocumentSession('test-doc', { onUpdate: () => {}, onSynced });
    session.destroy();
    session.destroy();
    await session.whenSynced;
    // A destroyed session must not fire onSynced afterwards.
    expect(onSynced).not.toHaveBeenCalled();
  });
});
