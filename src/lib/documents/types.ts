/**
 * Shared types for the Documents app.
 *
 * Phase 1 stores documents locally (metadata in localStorage, the rich-text
 * body as a Yjs document persisted to IndexedDB) and releases portable
 * Markdown snapshots as NIP-23 kind 30023 events. Phase 2 moves the live
 * document behind a Hocuspocus-style collaboration service that owns the
 * ACL — the roles below already model that boundary.
 */

/** Document access roles, ordered from most to least privileged. */
export type DocumentRole = 'owner' | 'editor' | 'commenter' | 'viewer';

/** What each role may do. Server-side enforcement arrives with Phase 2. */
export const ROLE_CAPABILITIES: Record<
  DocumentRole,
  { edit: boolean; comment: boolean; manageAccess: boolean; publish: boolean }
> = {
  owner: { edit: true, comment: true, manageAccess: true, publish: true },
  editor: { edit: true, comment: true, manageAccess: false, publish: false },
  commenter: { edit: false, comment: true, manageAccess: false, publish: false },
  viewer: { edit: false, comment: false, manageAccess: false, publish: false },
};

export interface PublicationRecord {
  /** Kind 30023 event id of the published snapshot. */
  eventId: string;
  /** NIP-23 `d` identifier of the snapshot. */
  identifier: string;
  /** Addressable coordinate (`30023:<pubkey>:<identifier>`). */
  address: string;
  publishedAt: number;
  /** Title the snapshot was published under. */
  title: string;
}

/** Validated NIP-94-style metadata for a Blossom attachment. */
export interface DocumentAttachment {
  url: string;
  mimeType?: string;
  /** Lowercase hex SHA-256 of the blob, when the uploader reported it. */
  sha256?: string;
  size?: number;
}

export interface DocumentMeta {
  /** Stable id, also the IndexedDB/Yjs document name. */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Milliseconds timestamp of the last successful autosave. */
  savedAt: number;
  role: DocumentRole;
  /** True once the owner has archived the document (kept, but read-only). */
  archived: boolean;
  /** Most recent published snapshot, if any. Never the live source of truth. */
  publication?: PublicationRecord;
  attachments: DocumentAttachment[];
}

/** Autosave surface state, shown in the editor toolbar. */
export type SaveState = 'loading' | 'saving' | 'saved' | 'offline' | 'error';
