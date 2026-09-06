import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { sanitizeUrl } from '@/lib/nostrUtils';
import { sanitizeHtml } from './sanitizeHtml';
import { docToMarkdown } from './markdown';

/**
 * Integration tests against a real headless Tiptap editor using the same
 * extension configuration as `useDocumentEditor`. They prove the constrained
 * schema + sanitizer + serializer chain holds on untrusted input.
 */
function createEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          isAllowedUri: (url) => sanitizeUrl(url) !== undefined,
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
  });
}

describe('editor schema + sanitizer', () => {
  it('rejects javascript: link hrefs end to end', () => {
    const editor = createEditor();
    editor.commands.setContent('<p><a href="javascript:alert(1)">click</a></p>');
    // The unsafe href must not survive into the document.
    expect(editor.getHTML()).not.toContain('javascript:');
    editor.destroy();
  });

  it('keeps safe link hrefs', () => {
    const editor = createEditor();
    editor.commands.setContent('<p><a href="https://example.com">click</a></p>');
    expect(editor.getHTML()).toContain('https://example.com');
    editor.destroy();
  });

  it('drops script content pasted as HTML', () => {
    const editor = createEditor();
    const sanitized = sanitizeHtml('<p>hello</p><script>alert(1)</script>');
    editor.commands.setContent(sanitized);
    expect(editor.getText()).toContain('hello');
    expect(editor.getHTML()).not.toContain('<script');
    editor.destroy();
  });

  it('serializes typed content to portable Markdown', () => {
    const editor = createEditor();
    editor.commands.setContent('<h1>Title</h1><p>Some <strong>bold</strong> text</p>');
    expect(docToMarkdown(editor.getJSON())).toBe('# Title\n\nSome **bold** text');
    editor.destroy();
  });

  it('serializes a table to GFM', () => {
    const editor = createEditor();
    editor
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run();
    const markdown = docToMarkdown(editor.getJSON());
    expect(markdown).toContain('| --- | --- |');
    editor.destroy();
  });
});
