import { useCallback, useEffect } from 'react';
import { ChevronLeft, FilePlus2, FileText } from 'lucide-react';
import {
  AppBody,
  AppLayout,
  AppSectionTitle,
  AppSplit,
  AppSidebar,
  AppToolbar,
  EmptyState,
} from '@/components/os/AppChrome';
import { LoginRequired } from '@/components/nostr/LoginRequired';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { useDocumentIndex } from '@/lib/documents/store';
import { deletePersistedDocument } from '@/lib/documents/ydoc';
import { relativeTime } from '@/lib/nostrUtils';
import type { DocumentMeta } from '@/lib/documents/types';
import { cn } from '@/lib/utils';
import type { AppProps } from '@/os/types';
import { DocumentEditor } from './DocumentEditor';

export default function DocumentsApp({ params, setTitle, setParams }: AppProps) {
  const isMobile = useIsMobile();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { documents, createDocument, updateDocument, removeDocument } = useDocumentIndex();

  // The open document lives in the window's params so a reload, a deep link
  // and the desktop/mobile shell switch all agree on what is open.
  const selectedId = params.doc ?? null;
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  useEffect(() => {
    setTitle(selected ? `Documents — ${selected.title}` : 'Documents');
  }, [selected, setTitle]);

  const openDocument = useCallback((id: string) => setParams({ doc: id }), [setParams]);
  const closeDocument = useCallback(() => setParams({}), [setParams]);

  const handleCreate = useCallback(() => {
    const meta = createDocument('Untitled document');
    openDocument(meta.id);
  }, [createDocument, openDocument]);

  const handleRename = useCallback(
    (id: string, title: string) => {
      updateDocument(id, { title, updatedAt: Date.now() });
    },
    [updateDocument],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeDocument(id);
      // The body lives in IndexedDB; removing the index entry alone would
      // leak it. Failures are non-fatal: the entry is already gone and an
      // orphaned IndexedDB database is inert.
      void deletePersistedDocument(id).catch(() => {});
      toast({ title: 'Document deleted' });
      if (selectedId === id) closeDocument();
    },
    [removeDocument, toast, selectedId, closeDocument],
  );

  if (!user) {
    return (
      <AppLayout>
        <AppToolbar>
          <span className="text-[13px] font-medium">Documents</span>
        </AppToolbar>
        <AppBody>
          <LoginRequired action="write documents" />
        </AppBody>
      </AppLayout>
    );
  }

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <Button size="sm" className="w-full gap-1.5" onClick={handleCreate}>
          <FilePlus2 className="size-3.5" aria-hidden />
          New document
        </Button>
      </div>
      <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
        <DocumentList
          documents={documents}
          selectedId={selectedId}
          onSelect={openDocument}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );

  const editorPane = !selected ? (
    <EmptyState
      title={documents.length === 0 ? 'No documents yet' : 'Pick a document'}
      hint={
        documents.length === 0
          ? 'Create your first document — it stays on this device and autosaves as you type.'
          : 'Choose one from the list, or start a new one.'
      }
      action={
        documents.length === 0 ? (
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <FilePlus2 className="size-3.5" aria-hidden />
            New document
          </Button>
        ) : undefined
      }
    />
  ) : (
    <DocumentEditor
      key={selected.id}
      meta={selected}
      onRename={handleRename}
      onDelete={handleDelete}
      onUpdateMeta={updateDocument}
    />
  );

  // Narrow windows have no room for a sidebar, so list and editor take turns.
  if (isMobile) {
    return (
      <AppLayout>
        {!selected && (
          <AppToolbar>
            <span className="text-[13px] font-medium">Documents</span>
          </AppToolbar>
        )}
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <AppToolbar className="h-9">
              <button
                type="button"
                onClick={closeDocument}
                className="-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All documents
              </button>
            </AppToolbar>
            {editorPane}
          </div>
        ) : (
          <AppBody className="flex flex-col">{listPane}</AppBody>
        )}
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppSplit>
        <AppSidebar className="w-60 p-0">{listPane}</AppSidebar>
        <AppBody className="flex flex-col">{editorPane}</AppBody>
      </AppSplit>
    </AppLayout>
  );
}

function DocumentList({
  documents,
  selectedId,
  onSelect,
  onCreate,
}: {
  documents: DocumentMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Nothing here yet.{' '}
          <button
            type="button"
            onClick={onCreate}
            className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Create a document
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <AppSectionTitle>Your documents</AppSectionTitle>
      <ul className="pb-2">
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onSelect(doc.id)}
              aria-current={doc.id === selectedId ? 'true' : undefined}
              className={cn(
                'w-full px-3 py-2 text-left transition-colors',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                doc.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="flex items-center gap-1.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-[13px] font-medium">{doc.title}</span>
              </span>
              <span className="mt-0.5 block truncate pl-5 text-[11px] text-muted-foreground">
                {doc.publication ? 'Published · ' : ''}
                {relativeTime(Math.floor(doc.updatedAt / 1000))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

