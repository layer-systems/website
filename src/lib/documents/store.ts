import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { DocumentMeta } from './types';

const INDEX_KEY = 'layer:documents:index';
const CURRENT_VERSION = 1;

interface DocumentIndex {
  version: number;
  documents: DocumentMeta[];
}

function emptyIndex(): DocumentIndex {
  return { version: CURRENT_VERSION, documents: [] };
}

function isValidMeta(value: unknown): value is DocumentMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.id === 'string' &&
    meta.id.length > 0 &&
    typeof meta.title === 'string' &&
    typeof meta.createdAt === 'number' &&
    typeof meta.updatedAt === 'number'
  );
}

function parseIndex(raw: string): DocumentIndex {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return emptyIndex();
  const documents = (parsed as Record<string, unknown>).documents;
  if (!Array.isArray(documents)) return emptyIndex();
  return { version: CURRENT_VERSION, documents: documents.filter(isValidMeta) };
}

function mintId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * The document library index: one localStorage entry holding the metadata of
 * every document. Bodies live in IndexedDB (see `ydoc.ts`), which keeps this
 * index tiny and keeps per-keystroke writes out of synchronous storage.
 *
 * `useLocalStorage` broadcasts writes on `window`, so a rename in one window
 * shows up in an open library without a reload.
 */
export function useDocumentIndex() {
  const [index, setIndex] = useLocalStorage<DocumentIndex>(INDEX_KEY, emptyIndex(), {
    serialize: JSON.stringify,
    deserialize: parseIndex,
  });

  const documents = [...index.documents]
    .filter((doc) => !doc.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const createDocument = (title: string): DocumentMeta => {
    const now = Date.now();
    const meta: DocumentMeta = {
      id: mintId(),
      title,
      createdAt: now,
      updatedAt: now,
      savedAt: now,
      role: 'owner',
      archived: false,
      attachments: [],
    };
    setIndex((prev) => ({ ...prev, documents: [...prev.documents, meta] }));
    return meta;
  };

  const updateDocument = (id: string, patch: Partial<Omit<DocumentMeta, 'id'>>) => {
    setIndex((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) =>
        doc.id === id ? { ...doc, ...patch, id: doc.id } : doc,
      ),
    }));
  };

  const removeDocument = (id: string) => {
    setIndex((prev) => ({
      ...prev,
      documents: prev.documents.filter((doc) => doc.id !== id),
    }));
  };

  return { documents, createDocument, updateDocument, removeDocument };
}
