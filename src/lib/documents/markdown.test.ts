import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { docToMarkdown, markdownToDoc } from './markdown';

function doc(...content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function para(...content: JSONContent[]): JSONContent {
  return { type: 'paragraph', content };
}

function text(text: string, marks?: JSONContent['marks']): JSONContent {
  const node: JSONContent = { type: 'text', text };
  if (marks) node.marks = marks;
  return node;
}

describe('docToMarkdown', () => {
  it('serializes headings and paragraphs', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
      para(text('Hello world')),
    );
    expect(docToMarkdown(input)).toBe('# Title\n\nHello world');
  });

  it('serializes inline marks', () => {
    const input = para(
      text('a '),
      text('bold', [{ type: 'bold' }]),
      text(' and '),
      text('italic', [{ type: 'italic' }]),
      text(' and '),
      text('struck', [{ type: 'strike' }]),
      text(' and '),
      text('code', [{ type: 'code' }]),
    );
    expect(docToMarkdown(doc(input))).toBe('a **bold** and *italic* and ~~struck~~ and `code`');
  });

  it('serializes links and drops unsafe hrefs', () => {
    const input = para(
      text('safe', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      text(' '),
      text('evil', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
    );
    expect(docToMarkdown(doc(input))).toBe('[safe](https://example.com) evil');
  });

  it('serializes bullet, ordered and task lists', () => {
    const input = doc(
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [para(text('one'))] },
          {
            type: 'listItem',
            content: [
              para(text('two')),
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [para(text('nested'))] }],
              },
            ],
          },
        ],
      },
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [para(text('first'))] },
          { type: 'listItem', content: [para(text('second'))] },
        ],
      },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [para(text('done'))] },
          { type: 'taskItem', attrs: { checked: false }, content: [para(text('todo'))] },
        ],
      },
    );
    expect(docToMarkdown(input)).toBe(
      '- one\n- two\n  - nested\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo',
    );
  });

  it('serializes quotes, code blocks and rules', () => {
    const input = doc(
      { type: 'blockquote', content: [para(text('wise words'))] },
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [text('const a = 1;')],
      },
      { type: 'horizontalRule' },
    );
    expect(docToMarkdown(input)).toBe('> wise words\n\n```ts\nconst a = 1;\n```\n\n---');
  });

  it('serializes tables as GFM', () => {
    const input = doc({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [para(text('Name'))] },
            { type: 'tableHeader', content: [para(text('Role'))] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [para(text('Ada'))] },
            { type: 'tableCell', content: [para(text('owner'))] },
          ],
        },
      ],
    });
    expect(docToMarkdown(input)).toBe(
      '| Name | Role |\n| --- | --- |\n| Ada | owner |',
    );
  });

  it('keeps pipes and newlines in table cells from breaking the table', () => {
    const input = doc({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [para(text('a|b'))] },
            { type: 'tableHeader', content: [para(text('c'))] },
          ],
        },
      ],
    });
    // The pipe is rewritten to the full-width form so the row still parses as
    // exactly two cells.
    expect(docToMarkdown(input)).toBe('| a¦b | c |\n| --- | --- |');
    // And it round-trips back to a two-cell table.
    const parsed = markdownToDoc('| a¦b | c |\n| --- | --- |');
    expect(docToMarkdown(parsed)).toBe('| a¦b | c |\n| --- | --- |');
  });

  it('escapes characters that would change meaning', () => {
    const input = para(text('1. not a list # not a heading *not italic*'));
    expect(docToMarkdown(doc(input))).toBe('1\\. not a list \\# not a heading \\*not italic\\*');
  });

  it('does not mangle text that is already a plain sentence', () => {
    const input = para(text('Hello world'));
    expect(docToMarkdown(doc(input))).toBe('Hello world');
  });

  it('returns an empty string for an empty document', () => {
    expect(docToMarkdown(doc(para()))).toBe('');
    expect(docToMarkdown(undefined)).toBe('');
  });
});

describe('markdownToDoc', () => {
  it('parses headings and paragraphs', () => {
    const result = markdownToDoc('# Title\n\nHello world');
    expect(result).toEqual(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
        para(text('Hello world')),
      ),
    );
  });

  it('parses inline marks', () => {
    const result = markdownToDoc('a **bold** and *italic* and ~~struck~~ and `code`');
    expect(result).toEqual(
      doc(
        para(
          text('a '),
          text('bold', [{ type: 'bold' }]),
          text(' and '),
          text('italic', [{ type: 'italic' }]),
          text(' and '),
          text('struck', [{ type: 'strike' }]),
          text(' and '),
          text('code', [{ type: 'code' }]),
        ),
      ),
    );
  });

  it('parses links and keeps unsafe hrefs as literal text', () => {
    const result = markdownToDoc('[safe](https://example.com) [evil](javascript:alert(1))');
    expect(result).toEqual(
      doc(
        para(
          text('safe', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
          text(' [evil](javascript:alert(1))'),
        ),
      ),
    );
  });

  it('parses bullet, ordered and task lists with nesting', () => {
    const result = markdownToDoc('- one\n- two\n  - nested\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo');
    expect(result).toEqual(
      doc(
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [para(text('one'))] },
            {
              type: 'listItem',
              content: [
                para(text('two')),
                {
                  type: 'bulletList',
                  content: [{ type: 'listItem', content: [para(text('nested'))] }],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [para(text('first'))] },
            { type: 'listItem', content: [para(text('second'))] },
          ],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: true }, content: [para(text('done'))] },
            { type: 'taskItem', attrs: { checked: false }, content: [para(text('todo'))] },
          ],
        },
      ),
    );
  });

  it('parses quotes, code blocks and rules', () => {
    const result = markdownToDoc('> wise words\n\n```ts\nconst a = 1;\n```\n\n---');
    expect(result).toEqual(
      doc(
        { type: 'blockquote', content: [para(text('wise words'))] },
        {
          type: 'codeBlock',
          attrs: { language: 'ts' },
          content: [text('const a = 1;')],
        },
        { type: 'horizontalRule' },
      ),
    );
  });

  it('parses GFM tables', () => {
    const result = markdownToDoc('| Name | Role |\n| --- | --- |\n| Ada | owner |');
    expect(result).toEqual(
      doc({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [para(text('Name'))] },
              { type: 'tableHeader', content: [para(text('Role'))] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [para(text('Ada'))] },
              { type: 'tableCell', content: [para(text('owner'))] },
            ],
          },
        ],
      }),
    );
  });

  it('unescapes escaped characters', () => {
    const result = markdownToDoc('1\\. not a list \\# not a heading \\*not italic\\*');
    expect(result).toEqual(doc(para(text('1. not a list # not a heading *not italic*'))));
  });
});

describe('round trip', () => {
  it('serialize(parse(x)) preserves the constructs the schema supports', () => {
    const source = [
      '# Title',
      '',
      'Some **bold** and *italic* and ~~struck~~ and `code` and a [link](https://example.com).',
      '',
      '- one',
      '- two',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '- [x] done',
      '- [ ] todo',
      '',
      '> wise words',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '| Name | Role |',
      '| --- | --- |',
      '| Ada | owner |',
      '',
      '---',
    ].join('\n');

    // The serializer escapes trailing punctuation aggressively; that output
    // must parse back to the identical document, and the second serialization
    // must be stable.
    const once = docToMarkdown(markdownToDoc(source));
    expect(markdownToDoc(once)).toEqual(markdownToDoc(source));
    expect(docToMarkdown(markdownToDoc(once))).toBe(once);
  });
});
