import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
  it('keeps allowlisted formatting elements', () => {
    const input = '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> and <s>struck</s> and <u>under</u>.</p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('removes scripts and event handlers', () => {
    const input = '<p onclick="alert(1)">hi</p><script>alert(2)</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('<script');
    expect(result).toContain('<p>hi</p>');
  });

  it('drops javascript: hrefs but keeps safe protocols', () => {
    const input =
      '<a href="javascript:alert(1)">evil</a><a href="https://example.com">safe</a><a href="nostr:npub1abc">mention</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<a>evil</a>');
    expect(result).toContain('href="https://example.com/"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('nostr:npub1abc');
  });

  it('unwraps disallowed elements but keeps their text', () => {
    const input = '<div><span>kept</span></div><iframe src="https://evil.example"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).toContain('kept');
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('evil.example');
  });

  it('strips style attributes and srcdoc', () => {
    const input = '<p style="background:url(javascript:alert(1))">styled</p>';
    expect(sanitizeHtml(input)).toBe('<p>styled</p>');
  });

  it('keeps checklist classes and data-checked', () => {
    const input =
      '<ul class="task-list"><li class="task-item" data-checked="true">done</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('keeps tables', () => {
    const input = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
