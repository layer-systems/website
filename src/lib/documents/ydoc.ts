import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

const DB_PREFIX = 'layer-doc-';

/** Callbacks a session reports through. */
export interface DocumentSessionEvents {
  /** Fired on every Yjs update (local typing and, later, remote peers). */
  onUpdate: () => void;
  /** Fired once the local copy has been loaded into the document. */
  onSynced: () => void;
}

export interface DocumentSession {
  doc: Y.Doc;
  /** Resolved when the local snapshot has been applied. */
  whenSynced: Promise<void>;
  /** Tears down persistence and frees the document. Safe to call twice. */
  destroy: () => void;
}

/** IndexedDB is unavailable in some environments (tests, locked-down modes). */
function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Constructing `IndexeddbPersistence` can throw even when IndexedDB exists
 * (e.g. blocked/denied storage in private browsing or locked-down
 * environments). Treat persistence as best-effort and degrade to `null`
 * (in-memory) rather than crashing the caller.
 */
function createPersistence(documentId: string, doc: Y.Doc): IndexeddbPersistence | null {
  if (!indexedDbAvailable()) return null;
  try {
    return new IndexeddbPersistence(`${DB_PREFIX}${documentId}`, doc);
  } catch {
    return null;
  }
}

/**
 * Opens the Yjs document for `documentId` with offline persistence behind it.
 *
 * The session is created and torn down in a `useEffect`, so React Strict
 * Mode's mount → unmount → mount cycle simply opens, closes and reopens it:
 * each mount gets its own `Y.Doc`, no provider or subscription outlives its
 * effect, and the IndexedDB write behind an update is idempotent, so the
 * double-mount cannot corrupt or duplicate state.
 *
 * Without IndexedDB the session degrades to an in-memory document: editing
 * still works, it just does not survive a reload until the Phase 2 service
 * provides persistence.
 *
 * Phase 2 attaches a Hocuspocus WebSocket provider here; `ydoc.on('update')`
 * is the single fan-in point, so nothing else changes.
 */
export function openDocumentSession(
  documentId: string,
  events: DocumentSessionEvents,
): DocumentSession {
  const doc = new Y.Doc();
  const persistence = createPersistence(documentId, doc);

  const onUpdate = () => events.onUpdate();
  doc.on('update', onUpdate);

  let destroyed = false;

  // `whenSynced` resolves with the persistence instance; callers only care
  // that the snapshot landed. Without persistence the doc starts empty and is
  // "synced" immediately — asynchronously, matching the IndexedDB contract.
  let whenSynced: Promise<void>;
  let cleanup: () => void;
  if (persistence) {
    const onSynced = () => events.onSynced();
    persistence.on('synced', onSynced);
    whenSynced = persistence.whenSynced.then(() => undefined);
    cleanup = () => persistence.off('synced', onSynced);
  } else {
    whenSynced = Promise.resolve().then(() => {
      if (!destroyed) events.onSynced();
    });
    cleanup = () => {};
  }

  return {
    doc,
    whenSynced,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      doc.off('update', onUpdate);
      cleanup();
      persistence?.destroy();
      doc.destroy();
    },
  };
}

/** Removes the persisted body of a document that was deleted from the index. */
export async function deletePersistedDocument(documentId: string): Promise<void> {
  const doc = new Y.Doc();
  try {
    const persistence = createPersistence(documentId, doc);
    if (!persistence) return;
    try {
      await persistence.clearData();
    } finally {
      persistence.destroy();
    }
  } finally {
    doc.destroy();
  }
}
