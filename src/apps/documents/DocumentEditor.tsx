import { useCallback, useState } from 'react';
import { EditorContent } from '@tiptap/react';
import {
  Check,
  CloudOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDocumentEditor } from '@/hooks/useDocumentEditor';
import { useDocumentPublish } from '@/hooks/useDocumentPublish';
import { useRelayHints } from '@/hooks/useRelayHints';
import { useToast } from '@/hooks/useToast';
import { deriveSummary } from '@/lib/documents/publish';
import { ROLE_CAPABILITIES } from '@/lib/documents/types';
import type { DocumentMeta, PublicationRecord, SaveState } from '@/lib/documents/types';
import { cn } from '@/lib/utils';
import { FormatToolbar } from './FormatToolbar';

interface DocumentEditorProps {
  meta: DocumentMeta;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onUpdateMeta: (id: string, patch: Partial<Omit<DocumentMeta, 'id'>>) => void;
}

export function DocumentEditor({ meta, onRename, onDelete, onUpdateMeta }: DocumentEditorProps) {
  const { toast } = useToast();

  const handleAutosaved = useCallback(() => {
    onUpdateMeta(meta.id, { savedAt: Date.now(), updatedAt: Date.now() });
  }, [meta.id, onUpdateMeta]);

  const { editor, saveState, words, canEdit, getMarkdown } = useDocumentEditor({
    documentId: meta.id,
    role: meta.role,
    onAutosaved: handleAutosaved,
  });

  const capabilities = ROLE_CAPABILITIES[meta.role];

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Document toolbar: title, save state, actions. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={() => canEdit && setRenameOpen(true)}
          disabled={!canEdit}
          aria-label={canEdit ? 'Rename document' : `Document title (renaming requires editor access; you are a ${meta.role})`}
          title={canEdit ? 'Rename document' : `You have ${meta.role} access — renaming is unavailable`}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            canEdit ? 'hover:bg-muted' : 'cursor-default',
          )}
        >
          <span className="truncate text-[13px] font-medium">{meta.title}</span>
          {canEdit && <Pencil className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
        </button>

        <SaveIndicator state={saveState} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {capabilities.publish && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setPublishOpen(true)}
            >
              <Send className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Publish</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                aria-label="Document actions"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </DropdownMenuItem>
              )}
              {meta.publication && <CopyPublicationLink meta={meta} />}
              {meta.role === 'owner' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FormatToolbar editor={editor} canEdit={canEdit} />

      {/* Editing surface. */}
      <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          {editor ? (
            <EditorContent editor={editor} aria-label={meta.title} />
          ) : (
            <div className="space-y-4 p-8" aria-busy="true" aria-label="Loading document">
              <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-4/5 animate-pulse rounded-md bg-muted" />
            </div>
          )}
        </div>
      </div>

      {/* Status bar. */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-[11px] text-muted-foreground">
        <span>{words} {words === 1 ? 'word' : 'words'}</span>
        <span className="capitalize">{meta.role}</span>
        {meta.publication && (
          <span className="truncate">
            Published {new Date(meta.publication.publishedAt * 1000).toLocaleDateString()}
          </span>
        )}
      </div>

      {renameOpen && (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          title={meta.title}
          onRename={(title) => {
            onRename(meta.id, title);
            setRenameOpen(false);
            toast({ title: 'Document renamed' });
          }}
        />
      )}

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={meta.title}
        onDelete={() => {
          setDeleteOpen(false);
          onDelete(meta.id);
        }}
      />

      {capabilities.publish && publishOpen && (
        <PublishDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          meta={meta}
          getMarkdown={getMarkdown}
          onPublished={(publication) => {
            onUpdateMeta(meta.id, { publication });
            setPublishOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content: Record<SaveState, { icon: React.ReactNode; label: string }> = {
    loading: { icon: <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />, label: 'Loading' },
    saving: { icon: <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />, label: 'Saving…' },
    saved: { icon: <Check className="size-3" aria-hidden />, label: 'Saved' },
    offline: { icon: <CloudOff className="size-3" aria-hidden />, label: 'Offline — saved on this device' },
    error: { icon: <CloudOff className="size-3" aria-hidden />, label: 'Save failed — will retry' },
  };

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'flex shrink-0 items-center gap-1 text-[11px]',
        state === 'offline' || state === 'error' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
    >
      {content[state].icon}
      <span className="hidden sm:inline">{content[state].label}</span>
      <span className="sr-only sm:hidden">{content[state].label}</span>
    </span>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  title,
  onRename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onRename: (title: string) => void;
}) {
  // The field initializes from the title on mount; the dialog body only
  // renders while open (see usage), so every open starts from the current
  // title without an effect.
  const [value, setValue] = useState(title);

  const trimmed = value.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>The new name shows up in your document library.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onRename(trimmed);
          }}
        >
          <div className="space-y-2 py-2">
            <Label htmlFor="doc-rename">Title</Label>
            <Input
              id="doc-rename"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!trimmed}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  title,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{title}”?</DialogTitle>
          <DialogDescription>
            This removes the document from this device. A published snapshot, if you made one,
            stays on your relays — delete it separately if needed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep document
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyPublicationLink({ meta }: { meta: DocumentMeta }) {
  const { toast } = useToast();
  const hints = useRelayHints();
  const { user } = useCurrentUser();
  const publication = meta.publication;

  if (!publication || !user) return null;

  return (
    <DropdownMenuItem
      onClick={async () => {
        try {
          const naddr = nip19.naddrEncode({
            pubkey: user.pubkey,
            kind: 30023,
            identifier: publication.identifier,
            relays: hints,
          });
          await navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
          toast({ title: 'Published article link copied' });
        } catch {
          toast({ title: 'Could not copy the link', variant: 'destructive' });
        }
      }}
    >
      Copy published link
    </DropdownMenuItem>
  );
}

function PublishDialog({
  open,
  onOpenChange,
  meta,
  getMarkdown,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: DocumentMeta;
  getMarkdown: () => string;
  onPublished: (publication: PublicationRecord) => void;
}) {
  const { toast } = useToast();
  const publish = useDocumentPublish();
  // The snapshot is captured the moment the dialog body mounts (the dialog
  // only renders it while open): what the owner reviews and confirms is
  // exactly what gets published, even if typing continues in the background.
  // The live document is never touched.
  const [snapshot] = useState(() => {
    const markdown = getMarkdown();
    return { markdown, summary: deriveSummary(markdown) };
  });
  const [summary, setSummary] = useState(snapshot.summary);

  const markdown = snapshot.markdown;
  const empty = markdown.trim().length === 0;

  if (!open) return null;

  const handlePublish = () => {
    publish.mutate(
      {
        meta,
        markdown,
        summary: summary.trim(),
        attachments: meta.attachments,
      },
      {
        onSuccess: ({ publication }) => {
          onPublished(publication);
          toast({ title: 'Document published', description: 'The snapshot is live on your relays.' });
        },
        onError: () => {
          toast({
            title: 'Publishing failed',
            description: 'None of your write relays accepted the article. Try again.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish “{meta.title}”</DialogTitle>
          <DialogDescription>
            Publishes a portable Markdown snapshot as a Nostr long-form article (kind 30023).
            This is a one-way release: the live document stays here and keeps autosaving —
            publishing never replaces or interrupts it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="doc-summary">Summary</Label>
            <Textarea
              id="doc-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              maxLength={280}
              placeholder="What is this document about?"
            />
          </div>
          {meta.publication && (
            <p className="text-xs text-muted-foreground">
              This document was published before. Publishing again updates the article at the same
              address.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publish.isPending}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={publish.isPending || empty}>
            {publish.isPending && (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {publish.isPending ? 'Publishing…' : 'Publish snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
