import assert from 'node:assert/strict';
import test from 'node:test';

import { phoneDialUrl } from '../src/domain/sos-actions.ts';

test('builds a dialer URL from a validated contact number', () => {
  assert.equal(phoneDialUrl('+91 98765-43210'), 'tel:+919876543210');
  assert.equal(phoneDialUrl('112'), 'tel:112');
});

test('rejects empty, malformed, and oversized dialer numbers', () => {
  assert.equal(phoneDialUrl(''), null);
  assert.equal(phoneDialUrl('call-me'), null);
  assert.equal(phoneDialUrl('abc112'), null);
  assert.equal(phoneDialUrl('112;123'), null);
  assert.equal(phoneDialUrl('1234567890123456'), null);
});
