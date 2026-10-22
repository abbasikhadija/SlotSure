import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConfirmation } from '../src/services/confirmation.js';
import { inspectPdf } from './helpers/pdf.js';

const row = {
  id: '123',
  starts_at: new Date('2026-10-29T04:30:00Z'),
  status: 'confirmed',
  customer_name: 'Émilie Γεώργιος',
  customer_email: 'emilie@example.test',
  consultant_name: 'Dr. Müller',
  canceled_at: null,
  checked_at: new Date('2026-10-22T05:00:00Z'),
};

test('PDF is parseable, embeds names and correct consultant-local date/time/reference/status', async () => {
  const buffer = await renderConfirmation(row, 'Asia/Karachi');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const { pages, text } = await inspectPdf(buffer);
  assert.equal(pages, 1);
  for (const expected of [
    'SlotSure',
    'SS-000123',
    row.customer_name,
    row.customer_email,
    row.consultant_name,
    'Thursday, 29 October 2026',
    '09:30',
    '10:00',
    'Asia/Karachi',
    '30 minutes',
    'Status: CONFIRMED',
    'Status checked:',
  ])
    assert.ok(text.includes(expected), `Missing PDF content: ${expected}`);
  assert.ok(!text.includes('CANCELED'));
});

test('canceled PDF preserves long names/email without clipping or false confirmation', async () => {
  const fixture = {
    ...row,
    status: 'canceled',
    canceled_at: row.checked_at,
    customer_name: 'É'.repeat(100),
    consultant_name: 'M'.repeat(100),
    customer_email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(60)}`,
  };
  const { pages, text } = await inspectPdf(
    await renderConfirmation(fixture, 'Asia/Karachi'),
  );
  assert.equal(pages, 1);
  for (const expected of [
    'Status: CANCELED',
    'does not reserve a time',
    'CANCELED AT',
    'snapshot',
    'SS-000123',
  ])
    assert.ok(
      text.includes(expected),
      `Missing canceled PDF content: ${expected}`,
    );
  for (const value of [
    fixture.customer_name,
    fixture.consultant_name,
    fixture.customer_email,
  ])
    assert.ok(text.replace(/\s/g, '').includes(value));
  assert.ok(!text.includes('CONFIRMED'));
});
