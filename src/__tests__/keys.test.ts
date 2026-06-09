import { describe, expect, it } from 'vitest';
import {
  METADATA_SK,
  VERSION_PREFIX,
  gsi1Pk,
  gsi1Sk,
  itemPk,
  parseItemId,
  versionSk,
} from '../lib/keys.js';

describe('keys', () => {
  it('encodes item partition keys', () => {
    expect(itemPk('abc-123')).toBe('ITEM#abc-123');
    expect(parseItemId('ITEM#abc-123')).toBe('abc-123');
  });

  it('zero-pads version sort keys for lexicographic order', () => {
    expect(versionSk(1)).toBe('VERSION#000001');
    expect(versionSk(10)).toBe('VERSION#000010');
    expect(versionSk(1) < versionSk(10)).toBe(true);
  });

  it('builds GSI1 keys from subject and status', () => {
    expect(gsi1Pk('AP Biology')).toBe('SUBJECT#AP Biology');
    expect(gsi1Sk('draft', 1700000000000)).toBe('draft#1700000000000');
    expect(METADATA_SK).toBe('METADATA');
    expect(VERSION_PREFIX).toBe('VERSION#');
  });
});
