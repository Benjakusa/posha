import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tokens = JSON.parse(await readFile(new URL('../src/tokens.json', import.meta.url), 'utf8'));

test('[P0-02] Ember token snapshot matches the design specification', () => {
  assert.deepEqual(tokens, {
    'maroon-950': '#2A0712',
    'maroon-900': '#3F0B1B',
    'maroon-700': '#6B1230',
    'maroon-600': '#8A1A3F',
    'red-600': '#C8102E',
    'red-500': '#E4344A',
    'pink-500': '#F0537F',
    'pink-300': '#F9A1B8',
    'pink-100': '#FDE1E9',
    'peach-400': '#FF9E7A',
    'peach-200': '#FFD0B8',
    'peach-100': '#FFEBDD',
    'cream-50': '#FFF8F3',
    'ink-900': '#1E0A10',
    'ink-600': '#6A4A52',
    success: '#2E9E6B',
    warning: '#E8A020',
    danger: '#B3001B',
    'gradient-ember': 'linear-gradient(135deg, #8A1A3F 0%, #C8102E 45%, #F0537F 80%, #FF9E7A 100%)',
    white: '#FFFFFF',
  });
});
