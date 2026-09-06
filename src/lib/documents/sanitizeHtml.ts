/**
 * Allowlist-based sanitizer for HTML that is about to enter the editor
 * (pasted or imported content). It never touches `innerHTML` on a live node
 * and never returns markup for `dangerouslySetInnerHTML` — the returned
 * string feeds Tiptap's paste parser only.
 *
 * The allowlist mirrors the constrained editor schema: headings, paragraphs,
 * lists, checklists, quotes, code, tables, links and inline formatting.
 * Everything else — scripts, styles, iframes, forms, event handlers,
 * `javascript:` URLs — is dropped, not escaped.
 */

const ALLOWED_ELEMENTS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** class="task-list" / "task-item" and data-checked carry checklist state. */
const ALLOWED_CLASSES = new Set(['task-list', 'task-item']);

const SAFE_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'nostr:']);

function sanitizeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function sanitizeAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();

    // Event handlers, styles and unknown data attributes never survive.
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (element.tagName === 'A' && name === 'href') {
      const safe = sanitizeHref(attribute.value);
      if (safe) {
        element.setAttribute('href', safe);
        element.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        element.removeAttribute(attribute.name);
      }
      continue;
    }

    if (name === 'class') {
      const kept = attribute.value
        .split(/\s+/)
        .filter((cls) => ALLOWED_CLASSES.has(cls))
        .join(' ');
      if (kept) element.setAttribute('class', kept);
      else element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'data-checked' && (attribute.value === 'true' || attribute.value === 'false')) {
      continue;
    }

    element.removeAttribute(attribute.name);
  }
}

function sanitizeElement(element: Element): void {
  // Children first: a disallowed child is unwrapped before we look up again.
  for (const child of [...element.children]) {
    sanitizeElement(child);
  }

  const tag = element.tagName.toLowerCase();
  if (!ALLOWED_ELEMENTS.has(tag)) {
    // Unwrap: keep the (already sanitized) children, drop the wrapper. This
    // keeps the text of a <div> or <span> instead of deleting it.
    element.replaceWith(...element.childNodes);
    return;
  }

  sanitizeAttributes(element);
}

/** Sanitize an HTML string into editor-safe markup. */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const child of [...doc.body.children]) {
    sanitizeElement(child);
  }
  return doc.body.innerHTML;
}
