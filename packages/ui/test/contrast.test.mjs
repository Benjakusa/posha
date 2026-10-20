import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contrastRatio, findContrastFailures } from '../scripts/check-contrast.mjs';

const tokens = JSON.parse(
  await readFile(new URL('../../config/src/tokens.json', import.meta.url), 'utf8'),
);
const pairs = JSON.parse(
  await readFile(new URL('../contrast-pairs.json', import.meta.url), 'utf8'),
);

test('[P0-02] contrast ratios use the WCAG relative-luminance formula', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
});

test('[P0-02] all approved Ember text and surface pairs meet their thresholds', () => {
  assert.deepEqual(findContrastFailures(tokens, pairs), []);
});

test('[P0-02] contrast validation catches a failing pair', () => {
  assert.equal(
    findContrastFailures({ white: '#FFFFFF', 'pink-300': '#F9A1B8' }, [
      { foreground: 'white', background: 'pink-300', minimum: 4.5 },
    ]).length,
    1,
  );
});
