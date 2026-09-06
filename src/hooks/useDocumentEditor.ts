import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { sanitizeHtml } from '@/lib/documents/sanitizeHtml';
import { docToMarkdown } from '@/lib/documents/markdown';
import { openDocumentSession } from '@/lib/documents/ydoc';
import { ROLE_CAPABILITIES } from '@/lib/documents/types';
import type { DocumentRole, SaveState } from '@/lib/documents/types';

const AUTOSAVE_DELAY = 1200;

export interface DocumentEditorOptions {
  documentId: string;
  role: DocumentRole;
  /** Called after every debounced autosave (stamps the metadata index). */
  onAutosaved?: () => void;
}

export interface DocumentEditor {
  editor: Editor | null;
  saveState: SaveState;
  /** Word count of the current document. */
  words: number;
  canEdit: boolean;
  /** Serialize the current document to portable Markdown. */
  getMarkdown: () => string;
  /** Replace the document with imported Markdown. */
  replaceWithMarkdown: (markdown: string) => void;
}

/**
 * Wires a Tiptap editor to the Yjs document behind `documentId`.
 *
 * - The `Y.Doc` + IndexedDB session lives in a ref, created and destroyed
 *   inside a `useEffect`: React Strict Mode's double-mount opens, closes and
 *   reopens it predictably — no duplicate persistence handles, no stale
 *   listener, and the closed first session cannot write over the second.
 * - The editor binds to the Yjs document through the Collaboration
 *   extension, which is the exact seam where the Phase 2 Hocuspocus provider
 *   attaches (`Collaboration.configure({ document, provider })`). Nothing
 *   else about the app changes when that lands.
 * - Collaboration replaces local undo/redo with the Yjs UndoManager, which
 *   tracks local-origin changes only — so undo behaves per-user (Word-like)
 *   now, and stays correct when remote peers join in Phase 2.
 * - Pasted/dropped HTML passes through the allowlist sanitizer before the
 *   editor's schema parse; the schema itself drops anything else.
 */
export function useDocumentEditor({
  documentId,
  role,
  onAutosaved,
}: DocumentEditorOptions): DocumentEditor {
  const canEdit = ROLE_CAPABILITIES[role].edit;

  // The session doc is set asynchronously once the session confirms it is
  // alive, which recreates the editor bound to that document. Strict Mode's
  // double-mount opens, closes and reopens the session predictably — the
  // closed first session's `then` is guarded off before it can set state.
  const [sessionDoc, setSessionDoc] = useState<Y.Doc | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [words, setWords] = useState(0);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const onAutosavedRef = useRef(onAutosaved);

  useEffect(() => {
    onAutosavedRef.current = onAutosaved;
  }, [onAutosaved]);

  const flushSave = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    // The Yjs update was already written to IndexedDB by the persistence
    // layer; here we surface the save and stamp the metadata index.
    setSaveState(navigator.onLine ? 'saved' : 'offline');
    onAutosavedRef.current?.();
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, AUTOSAVE_DELAY);
  }, [flushSave]);

  // Open the Yjs session per document. The state write happens inside the
  // session's promise, never synchronously in the effect body.
  useEffect(() => {
    let active = true;
    const session = openDocumentSession(documentId, {
      onSynced: () => {
        if (active) setSaveState(navigator.onLine ? 'saved' : 'offline');
      },
      // IndexedDB persists every update immediately; the debounced React
      // affordance is driven by the editor's own onUpdate.
      onUpdate: () => {},
    });
    session.whenSynced.then(() => {
      if (active) setSessionDoc(session.doc);
    });
    return () => {
      active = false;
      setSessionDoc(null);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirty.current = false;
      session.destroy();
    };
  }, [documentId]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      shouldRerenderOnTransaction: true,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            // Only protocols on the shared allowlist may become links. This
            // keeps `nostr:` mentions working while `javascript:`/`data:`
            // hrefs are dropped.
            isAllowedUri: (url) => sanitizeUrl(url) !== undefined,
          },
        }),
        ...(sessionDoc ? [Collaboration.configure({ document: sessionDoc })] : []),
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
      ],
      editorProps: {
        attributes: {
          class: 'doc-editor',
          // The editable region is the labelled document body.
          role: 'textbox',
          'aria-multiline': 'true',
        },
        transformPastedHTML: (html) => sanitizeHtml(html),
      },
      onUpdate: ({ editor: instance }) => {
        setWords(countWords(instance.getText()));
        scheduleSave();
      },
    },
    [documentId, sessionDoc, canEdit],
  );

  // Coming back online updates the autosave affordance.
  useEffect(() => {
    const onOnline = () => setSaveState((s) => (s === 'offline' ? 'saved' : s));
    const onOffline = () => setSaveState((s) => (s === 'saved' ? 'offline' : s));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Keep editability in sync if the role changes while the editor is open.
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  const getMarkdown = useCallback(
    () => (editor ? docToMarkdown(editor.getJSON()) : ''),
    [editor],
  );

  const replaceWithMarkdown = useCallback(
    (markdown: string) => {
      if (!editor || !canEdit) return;
      // Lazy import keeps the parser out of the first-paint path.
      import('@/lib/documents/markdown').then(({ markdownToDoc }) => {
        const doc = markdownToDoc(markdown);
        editor.chain().focus().setContent(doc.content ?? []).run();
      });
    },
    [editor, canEdit],
  );

  return { editor, saveState, words, canEdit, getMarkdown, replaceWithMarkdown };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
