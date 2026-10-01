import { describe, expect, it } from 'vitest';
import {
  INBOX_SEARCH_MAX_LENGTH,
  decodeInboxCursor,
  encodeInboxCursor,
  sanitizeSearchTerm
} from './inbox';

describe('inbox cursor', () => {
  it('round trips a cursor with a timestamp', () => {
    const cursor = {
      id: 'f9534302-7c07-4b7f-9051-c0f91a56ebf8',
      lastMessageAt: '2026-09-28T20:18:57.250Z'
    };
    expect(decodeInboxCursor(encodeInboxCursor(cursor))).toEqual(cursor);
  });

  it('round trips a cursor without a timestamp, for conversations without messages', () => {
    const cursor = { id: 'f9534302-7c07-4b7f-9051-c0f91a56ebf8', lastMessageAt: null };
    expect(decodeInboxCursor(encodeInboxCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['no es json', 'no-es-json'],
    ['arreglo', '[1,2,3]'],
    ['sin id', '{"lastMessageAt":null}'],
    ['id vacio', '{"id":"   ","lastMessageAt":null}'],
    ['id no textual', '{"id":7,"lastMessageAt":null}'],
    ['fecha no textual', '{"id":"a","lastMessageAt":7}'],
    ['fecha invalida', '{"id":"a","lastMessageAt":"ayer"}'],
    ['nulo', null],
    ['vacio', '']
  ])('rejects a malformed cursor: %s', (_case, value) => {
    expect(decodeInboxCursor(value)).toBeNull();
  });

  it('accepts an explicit empty search as no filter', () => {
    expect(sanitizeSearchTerm('   ')).toBeNull();
  });
});

describe('inbox search term', () => {
  it('keeps names, usernames and accents intact', () => {
    expect(sanitizeSearchTerm('  Germán Mtz  ')).toBe('Germán Mtz');
    expect(sanitizeSearchTerm('@germartzc')).toBe('@germartzc');
  });

  it.each([
    ['coma', 'a,b', 'a b'],
    ['parentesis', 'a(b)', 'a b'],
    ['comodin de like', 'a%_b', 'a b'],
    ['asterisco', 'a*b', 'a b'],
    ['punto estructural', 'a.b', 'a b'],
    ['barra invertida', 'a\\b', 'a b'],
    ['comillas', 'a"b\'c', 'a b c'],
    ['comparadores', 'a<b>c', 'a b c']
  ])('removes reserved characters instead of escaping them: %s', (_case, term, expected) => {
    expect(sanitizeSearchTerm(term)).toBe(expected);
  });

  it('drops a term made only of reserved characters', () => {
    expect(sanitizeSearchTerm('*,()')).toBeNull();
  });

  it('bounds the term at the maximum length before cleaning it', () => {
    const long = 'a'.repeat(INBOX_SEARCH_MAX_LENGTH + 40);
    expect(sanitizeSearchTerm(long)).toHaveLength(INBOX_SEARCH_MAX_LENGTH);
  });

  it('is idempotent', () => {
    const once = sanitizeSearchTerm('  German, (Mtz)  ');
    expect(sanitizeSearchTerm(once)).toBe(once);
  });

  it('does not fabricate a term from missing input', () => {
    expect(sanitizeSearchTerm(undefined)).toBeNull();
    expect(sanitizeSearchTerm(null)).toBeNull();
  });
});
