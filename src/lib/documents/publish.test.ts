import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { buildPublishTemplate, deriveSummary, documentIdentifier, publicationFromEvent } from './publish';
import type { DocumentMeta } from './types';

function meta(overrides: Partial<DocumentMeta> = {}): DocumentMeta {
  return {
    id: 'abcd1234-0000-0000-0000-000000000000',
    title: 'My Notes',
    createdAt: 0,
    updatedAt: 0,
    savedAt: 0,
    role: 'owner',
    archived: false,
    attachments: [],
    ...overrides,
  };
}

describe('documentIdentifier', () => {
  it('slugifies the title and suffixes the document id', () => {
    expect(documentIdentifier('My Notes!', 'abcd1234-rest')).toBe('my-notes-abcd1234');
  });

  it('falls back to a generic slug for untitled documents', () => {
    expect(documentIdentifier('!!!', 'abcd1234-rest')).toBe('document-abcd1234');
  });
});

describe('buildPublishTemplate', () => {
  it('builds a NIP-23 kind 30023 template', () => {
    const template = buildPublishTemplate(meta(), '# Hello\n\nBody', 'A summary', []);
    expect(template.kind).toBe(30023);
    expect(template.content).toBe('# Hello\n\nBody');
    expect(template.tags).toContainEqual(['d', 'my-notes-abcd1234']);
    expect(template.tags).toContainEqual(['title', 'My Notes']);
    expect(template.tags).toContainEqual(['summary', 'A summary']);
    expect(template.tags.some(([name]) => name === 'published_at')).toBe(true);
  });

  it('reuses the existing identifier on republish', () => {
    const existing = meta({
      publication: {
        eventId: 'e',
        identifier: 'kept-slug',
        address: '30023:pk:kept-slug',
        publishedAt: 1,
        title: 'Old',
      },
    });
    const template = buildPublishTemplate(existing, 'body', '', []);
    expect(template.tags).toContainEqual(['d', 'kept-slug']);
  });

  it('attaches NIP-94 imeta metadata', () => {
    const attachment = { url: 'https://blossom.example/f.png', sha256: 'a'.repeat(64) };
    const template = buildPublishTemplate(meta(), 'body', '', [attachment]);
    expect(template.tags.some(([name]) => name === 'imeta')).toBe(true);
    expect(template.tags).toContainEqual(['x', 'a'.repeat(64)]);
  });
});

describe('publicationFromEvent', () => {
  it('extracts the address and timestamp', () => {
    const event: NostrEvent = {
      id: 'event-id',
      pubkey: 'pk',
      kind: 30023,
      created_at: 100,
      content: '',
      sig: '',
      tags: [
        ['d', 'slug'],
        ['published_at', '99'],
      ],
    };
    expect(publicationFromEvent(event, 'My Notes')).toEqual({
      eventId: 'event-id',
      identifier: 'slug',
      address: '30023:pk:slug',
      publishedAt: 99,
      title: 'My Notes',
    });
  });
});

describe('deriveSummary', () => {
  it('strips Markdown syntax into plain text', () => {
    expect(deriveSummary('# Title\n\nSome **bold** [link](https://example.com) text')).toBe(
      'Title Some bold link text',
    );
  });

  it('truncates long bodies', () => {
    const long = 'word '.repeat(100);
    const summary = deriveSummary(long, 40);
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary.endsWith('…')).toBe(true);
  });
});
