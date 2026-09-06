import type { JSONContent } from '@tiptap/core';

/**
 * ProseMirror JSON ↔ portable Markdown.
 *
 * The serializer produces the NIP-23 snapshot body. It is a small, fully
 * understood walk over the constrained editor schema: the only HTML that
 * ever reaches the editor has already passed `sanitizeHtml`, and the output
 * here is plain text, so no untrusted HTML survives a publish.
 *
 * The parser covers the same constructs so a published snapshot can be
 * imported back and tests can round-trip. It is not a general Markdown
 * implementation — anything unrecognised degrades to a paragraph instead of
 * dropping content.
 */

const MENTION_PATTERN = /^nostr:((npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+)$/;

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function escapeText(text: string): string {
  // Escape every CommonMark-significant ASCII punctuation character. These
  // are exactly the characters a backslash escapes per the spec, so the
  // output is uniform, always round-trips, and needs no positional cases.
  return text.replace(/([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '\\$1');
}

function isSafeHref(href: string | undefined | null): href is string {
  if (!href) return false;
  if (MENTION_PATTERN.test(href)) return true;
  try {
    const parsed = new URL(href, 'https://layer.invalid');
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function serializeInline(nodes: JSONContent[] | undefined): string {
  if (!nodes) return '';
  let out = '';

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out += '\\\n';
      continue;
    }
    if (node.type !== 'text' || typeof node.text !== 'string') continue;

    const prefix: string[] = [];
    const suffix: string[] = [];
    let code = false;

    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'code':
          code = true;
          break;
        case 'bold': prefix.push('**'); suffix.unshift('**'); break;
        case 'italic': prefix.push('*'); suffix.unshift('*'); break;
        case 'strike': prefix.push('~~'); suffix.unshift('~~'); break;
        case 'underline': prefix.push('<u>'); suffix.unshift('</u>'); break;
        case 'link': {
          const href = (mark.attrs as { href?: string } | undefined)?.href;
          if (isSafeHref(href)) {
            prefix.push('[');
            suffix.unshift(`](${href})`);
          }
          break;
        }
        default:
          break;
      }
    }

    let text: string;
    if (code) {
      // Inline code is never escaped; pick a fence that cannot collide.
      const longest = Math.max(0, ...[...node.text.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      const pad = node.text.startsWith('`') || node.text.endsWith('`') ? ' ' : '';
      text = `${fence}${pad}${node.text}${pad}${fence}`;
    } else {
      text = escapeText(node.text);
    }

    out += `${prefix.join('')}${text}${suffix.join('')}`;
  }

  return out;
}

function serializeList(
  node: JSONContent,
  depth: number,
  ordered: boolean,
  task: boolean,
): string[] {
  const lines: string[] = [];
  let index = 0;

  for (const item of node.content ?? []) {
    index += 1;
    const indent = '  '.repeat(depth);
    const marker = task ? '-' : ordered ? `${index}.` : '-';
    const checkbox = task
      ? ` [${(item.attrs as { checked?: boolean } | undefined)?.checked ? 'x' : ' '}]`
      : '';

    let first = true;
    for (const block of item.content ?? []) {
      if (block.type === 'paragraph') {
        const text = serializeInline(block.content);
        lines.push(first ? `${indent}${marker}${checkbox} ${text}` : `${indent}  ${text}`);
        first = false;
      } else if (
        block.type === 'bulletList' ||
        block.type === 'orderedList' ||
        block.type === 'taskList'
      ) {
        lines.push(
          ...serializeList(
            block,
            depth + 1,
            block.type === 'orderedList',
            block.type === 'taskList',
          ),
        );
      } else {
        const nested = serializeBlock(block);
        if (nested) {
          lines.push(...nested.split('\n').map((line) => `${indent}  ${line}`));
        }
      }
    }
    if (first) lines.push(`${indent}${marker}${checkbox}`);
  }

  return lines;
}

function serializeTable(node: JSONContent): string[] {
  const rows: string[][] = [];
  for (const row of node.content ?? []) {
    if (row.type !== 'tableRow') continue;
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') continue;
      const text = (cell.content ?? [])
        .map((block) => serializeInline(block.content))
        .join(' ')
        // Inside a table row a pipe would break the cell boundary and a
        // newline would break the row. The inline text has already had any
        // `|` escaped to `\|`; rewrite that escaped pipe (and any bare one)
        // to the full-width `¦` so the row keeps its structural cells without
        // emitting a backslash. Newlines become a space.
        .replace(/\\?\|/g, '¦')
        .replace(/\n/g, ' ')
        .trim();
      cells.push(text);
    }
    rows.push(cells);
  }
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]);
  const lines = padded.map((row) => `| ${row.join(' | ')} |`);
  // GFM needs a header row; the first row always plays that role.
  const separator = `| ${Array<string>(width).fill('---').join(' | ')} |`;
  return [lines[0], separator, ...lines.slice(1)];
}

function serializeBlock(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return serializeInline(node.content);
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const text = serializeInline(node.content);
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'blockquote': {
      const inner = serializeBlocks(node.content);
      return inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const body = (node.content ?? [])
        .filter((child) => child.type === 'text' && typeof child.text === 'string')
        .map((child) => child.text)
        .join('');
      const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${language}\n${body.replace(/\n$/, '')}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return serializeList(
        node,
        0,
        node.type === 'orderedList',
        node.type === 'taskList',
      ).join('\n');
    case 'table':
      return serializeTable(node).join('\n');
    default:
      return '';
  }
}

function serializeBlocks(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => serializeBlock(node))
    .filter((block) => block.trim().length > 0)
    .join('\n\n');
}

/** Serialize the editor document to portable Markdown. */
export function docToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return serializeBlocks(doc.content).replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

type Mark = NonNullable<JSONContent['marks']>[number];

function textNode(text: string, marks?: Mark[]): JSONContent {
  const node: JSONContent = { type: 'text', text };
  if (marks && marks.length > 0) node.marks = marks;
  return node;
}

const UNESCAPE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
const UNESCAPE_SINGLE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;

/** Inline Markdown → text nodes: code, bold, italic, strike, links, mentions. */
function parseInline(source: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let rest = source;

  const pushText = (text: string) => {
    if (text) nodes.push(textNode(text.replace(UNESCAPE, '$1')));
  };

  while (rest.length > 0) {
    // Backslash escape: the punctuation after it is always literal. This must
    // win over every construct below (e.g. `\*` must not open emphasis).
    if (rest[0] === '\\') {
      if (rest.length > 1 && UNESCAPE_SINGLE.test(rest[1])) {
        pushText(rest[1]);
        rest = rest.slice(2);
      } else {
        pushText(rest[0]);
        rest = rest.slice(1);
      }
      continue;
    }

    // Inline code: `code` with any fence length.
    const code = rest.match(/^(`+)(.+?)\1(?!`)/s);
    if (code) {
      nodes.push(textNode(code[2], [{ type: 'code' }]));
      rest = rest.slice(code[0].length);
      continue;
    }

    // [label](href)
    const link = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/);
    if (link) {
      const [, label, href] = link;
      if (isSafeHref(href)) {
        for (const inner of parseInline(label)) {
          nodes.push({ ...inner, marks: [...(inner.marks ?? []), { type: 'link', attrs: { href } }] });
        }
      } else {
        pushText(link[0]);
      }
      rest = rest.slice(link[0].length);
      continue;
    }

    // Bare nostr: mention becomes a link.
    const mention = rest.match(/^nostr:((npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+)/);
    if (mention) {
      nodes.push(textNode(`${mention[1].slice(0, 16)}…`, [{ type: 'link', attrs: { href: mention[0] } }]));
      rest = rest.slice(mention[0].length);
      continue;
    }

    // Bold, italic, strike — longest token first.
    const bold = rest.match(/^\*\*([^*]+)\*\*/) ?? rest.match(/^__([^_]+)__/);
    if (bold) {
      for (const inner of parseInline(bold[1])) {
        nodes.push({ ...inner, marks: [...(inner.marks ?? []), { type: 'bold' } satisfies Mark] });
      }
      rest = rest.slice(bold[0].length);
      continue;
    }
    const italic = rest.match(/^\*([^*]+)\*/) ?? rest.match(/^_([^_]+)_/);
    if (italic) {
      for (const inner of parseInline(italic[1])) {
        nodes.push({ ...inner, marks: [...(inner.marks ?? []), { type: 'italic' } satisfies Mark] });
      }
      rest = rest.slice(italic[0].length);
      continue;
    }
    const strike = rest.match(/^~~([^~]+)~~/);
    if (strike) {
      for (const inner of parseInline(strike[1])) {
        nodes.push({ ...inner, marks: [...(inner.marks ?? []), { type: 'strike' } satisfies Mark] });
      }
      rest = rest.slice(strike[0].length);
      continue;
    }

    // Plain text up to the next possible construct.
    const next = rest.search(/[`*_~[\]!]|\\(?=[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|nostr:/);
    if (next === -1) {
      pushText(rest);
      break;
    }
    if (next === 0) {
      pushText(rest[0]);
      rest = rest.slice(1);
      continue;
    }
    pushText(rest.slice(0, next));
    rest = rest.slice(next);
  }

  // Merge adjacent text nodes carrying identical marks.
  const merged: JSONContent[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === 'text' &&
      node.type === 'text' &&
      JSON.stringify(prev.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      prev.text = (prev.text ?? '') + (node.text ?? '');
    } else {
      merged.push(node);
    }
  }
  return merged;
}

const LIST_ITEM = /^(\s*)([-+*]|\d+\.)\s+(?:\[( |x|X)\][ \t]+)?(.*)$/;

interface ParsedListItem {
  indent: number;
  ordered: boolean;
  task: boolean;
  checked: boolean;
  text: string;
}

/** Turn a flat run of list-item lines into nested list nodes. */
function buildList(items: ParsedListItem[]): JSONContent | null {
  if (items.length === 0) return null;

  interface Frame {
    indent: number;
    type: 'bulletList' | 'orderedList' | 'taskList';
    node: JSONContent;
    /** Last item added, so a deeper list nests underneath it. */
    lastItem: JSONContent | null;
  }

  const first = items[0];
  const root: Frame = {
    indent: first.indent,
    type: first.task ? 'taskList' : first.ordered ? 'orderedList' : 'bulletList',
    node: { type: first.task ? 'taskList' : first.ordered ? 'orderedList' : 'bulletList', content: [] },
    lastItem: null,
  };
  const stack: Frame[] = [root];

  for (const item of items) {
    const type = item.task ? 'taskList' : item.ordered ? 'orderedList' : 'bulletList';

    // Pop frames this line no longer belongs to.
    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    let frame = stack[stack.length - 1];
    if (item.indent > frame.indent) {
      // Deeper: nest a new list inside the previous item.
      frame = { indent: item.indent, type, node: { type, content: [] }, lastItem: null };
      const parent = stack[stack.length - 1].lastItem;
      if (parent) {
        parent.content = [...(parent.content ?? []), frame.node];
      }
      stack.push(frame);
    } else if (frame.type !== type && item.indent === frame.indent) {
      // Marker flavor changed at the same depth: switch this list's type.
      frame.type = type;
      frame.node.type = type;
    }

    const node: JSONContent = {
      type: item.task ? 'taskItem' : 'listItem',
      ...(item.task ? { attrs: { checked: item.checked } } : {}),
      content: [{ type: 'paragraph', content: parseInline(item.text) }],
    };
    frame.node.content = [...(frame.node.content ?? []), node];
    frame.lastItem = node;
  }

  return root.node;
}

/** Parse Markdown into a ProseMirror-compatible JSON document. */
export function markdownToDoc(markdown: string): JSONContent {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: JSONContent[] = [];

  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (!text) return;
    const content = parseInline(text);
    blocks.push({ type: 'paragraph', ...(content.length > 0 ? { content } : {}) });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    const fence = line.match(/^(`{3,}|~{3,})([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const marker = fence[1][0];
      const length = fence[1].length;
      const language = fence[2] ?? '';
      const body: string[] = [];
      i += 1;
      const closing = new RegExp(`^\\${marker}{${length},}\\s*$`);
      while (i < lines.length && !closing.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume the closing fence (or run off the end)
      blocks.push({
        type: 'codeBlock',
        attrs: { language: language || null },
        ...(body.length > 0 ? { content: [{ type: 'text', text: body.join('\n') }] } : {}),
      });
      continue;
    }

    // Table: header row, | --- | separator, then body rows.
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushParagraph();
          const parseRow = (row: string, header: boolean): JSONContent => ({
        type: 'tableRow',
        content: row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          // Cells split on a bare `|`; a backslash-escaped `\|` stays inline.
          .split(/(?<!\\)\|/)
          .map((cell) => ({
            type: header ? 'tableHeader' : 'tableCell',
            content: [
              {
                type: 'paragraph',
                // `\|` (external GFM) and `¦` (our own full-width form) both
                // restore to a literal pipe in the cell text.
                content: parseInline(cell.replace(/\\\|/g, '|').replace(/¦/g, '|').trim()),
              },
            ],
          })),
      });
      const rows: JSONContent[] = [parseRow(line, true)];
      i += 2;
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(parseRow(lines[i], false));
        i += 1;
      }
      blocks.push({ type: 'table', content: rows });
      continue;
    }

    // Heading.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const content = parseInline(heading[2].trim());
      blocks.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        ...(content.length > 0 ? { content } : {}),
      });
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    // Blockquote: collect the run and parse the inner text recursively.
    if (/^\s*>/.test(line)) {
      flushParagraph();
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        inner.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const doc = markdownToDoc(inner.join('\n'));
      blocks.push({ type: 'blockquote', content: doc.content ?? [] });
      continue;
    }

    // List run (bullets, ordered, tasks), nested by two-space indentation.
    if (LIST_ITEM.test(line)) {
      flushParagraph();
      const items: ParsedListItem[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const match = lines[i].match(LIST_ITEM)!;
        items.push({
          indent: match[1].replace(/\t/g, '  ').length,
          ordered: /^\d+\.$/.test(match[2]),
          task: match[3] !== undefined,
          checked: (match[3] ?? '').toLowerCase() === 'x',
          text: match[4] ?? '',
        });
        i += 1;
      }
      const list = buildList(items);
      if (list) blocks.push(list);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph();

  return { type: 'doc', content: blocks };
}
