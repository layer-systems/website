import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface FormatToolbarProps {
  editor: Editor | null;
  canEdit: boolean;
}

/**
 * The compact formatting toolbar. It scrolls horizontally on narrow windows
 * rather than wrapping, so every control stays one row-tap away at ~360px.
 */
export function FormatToolbar({ editor, canEdit }: FormatToolbarProps) {
  const disabled = !editor || !canEdit;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="os-scroll flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border px-2"
    >
      <ToolbarButton
        label="Undo"
        shortcut="Ctrl+Z"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor?.chain().focus().undo().run()}
        icon={<Undo2 className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor?.chain().focus().redo().run()}
        icon={<Redo2 className="size-4" aria-hidden />}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Bold"
        shortcut="Ctrl+B"
        disabled={disabled}
        active={editor?.isActive('bold')}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        icon={<Bold className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Italic"
        shortcut="Ctrl+I"
        disabled={disabled}
        active={editor?.isActive('italic')}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        icon={<Italic className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Underline"
        shortcut="Ctrl+U"
        disabled={disabled}
        active={editor?.isActive('underline')}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        icon={<Underline className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Strikethrough"
        disabled={disabled}
        active={editor?.isActive('strike')}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        icon={<Strikethrough className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Inline code"
        shortcut="Ctrl+E"
        disabled={disabled}
        active={editor?.isActive('code')}
        onClick={() => editor?.chain().focus().toggleCode().run()}
        icon={<Code className="size-4" aria-hidden />}
      />
      <LinkControl editor={editor} disabled={disabled} />

      <ToolbarDivider />

      <ToolbarButton
        label="Heading 1"
        disabled={disabled}
        active={editor?.isActive('heading', { level: 1 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        icon={<Heading1 className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Heading 2"
        disabled={disabled}
        active={editor?.isActive('heading', { level: 2 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        icon={<Heading2 className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Heading 3"
        disabled={disabled}
        active={editor?.isActive('heading', { level: 3 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        icon={<Heading3 className="size-4" aria-hidden />}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Bullet list"
        disabled={disabled}
        active={editor?.isActive('bulletList')}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        icon={<List className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Numbered list"
        disabled={disabled}
        active={editor?.isActive('orderedList')}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        icon={<ListOrdered className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Checklist"
        disabled={disabled}
        active={editor?.isActive('taskList')}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
        icon={<ListChecks className="size-4" aria-hidden />}
      />

      <ToolbarDivider />

      <ToolbarButton
        label="Quote"
        disabled={disabled}
        active={editor?.isActive('blockquote')}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        icon={<Quote className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Code block"
        disabled={disabled}
        active={editor?.isActive('codeBlock')}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        icon={<Code2 className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Table"
        disabled={disabled}
        active={editor?.isActive('table')}
        onClick={() => {
          if (!editor) return;
          if (editor.isActive('table')) editor.chain().focus().deleteTable().run();
          else editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}
        icon={<Table className="size-4" aria-hidden />}
      />
      <ToolbarButton
        label="Horizontal rule"
        disabled={disabled}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        icon={<Minus className="size-4" aria-hidden />}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  disabled,
  active,
  onClick,
  icon,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function LinkControl({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const active = editor?.isActive('link') ?? false;

  // Prefill with the current link's href when the popover opens on one. This
  // is event-driven (not an effect), so it runs once per open gesture.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setValue((editor?.getAttributes('link').href as string | undefined) ?? '');
  };

  const apply = () => {
    if (!editor) return;
    const trimmed = value.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      setOpen(false);
      return;
    }
    // The href is untrusted input: only allowlisted protocols survive.
    const safe = sanitizeUrl(trimmed);
    if (!safe) {
      toast({
        title: 'That link is not allowed',
        description: 'Only https, http, mailto and nostr links work here.',
        variant: 'destructive',
      });
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Link"
          aria-pressed={active}
          title="Link"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed disabled:opacity-40',
            active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Link2 className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <label htmlFor="doc-link-href" className="text-xs font-medium">
          Link URL
        </label>
        <Input
          id="doc-link-href"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://…"
          inputMode="url"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          {active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setOpen(false);
              }}
            >
              Remove
            </Button>
          )}
          <Button size="sm" onClick={apply}>
            {active ? 'Update' : 'Add link'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
