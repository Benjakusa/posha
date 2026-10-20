import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixtures = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
assert.equal(fixtures.schemaVersion, 'pending-p1-01');
assert.ok(Array.isArray(fixtures.profiles) && fixtures.profiles.length > 0);

const keys = new Set();
const handles = new Set();
for (const profile of fixtures.profiles) {
  assert.deepEqual(Object.keys(profile).sort(), [
    'country',
    'displayName',
    'fixtureKey',
    'handle',
    'interests',
    'locale',
  ]);
  assert.match(profile.fixtureKey, /^[a-z0-9-]+$/);
  assert.match(profile.handle, /^test_[a-z0-9_]+$/);
  assert.equal(
    profile.displayName,
    `Test ${profile.handle.replace(/^test_/, '').replaceAll('_', ' ')}`.replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    ),
  );
  assert.match(profile.locale, /^[a-z]{2}$/);
  assert.match(profile.country, /^[A-Z]{2}$/);
  assert.ok(profile.interests.every((interest) => /^[a-z]+$/.test(interest)));
  assert.ok(!keys.has(profile.fixtureKey), `duplicate fixture key ${profile.fixtureKey}`);
  assert.ok(!handles.has(profile.handle), `duplicate handle ${profile.handle}`);
  keys.add(profile.fixtureKey);
  handles.add(profile.handle);
}

process.stdout.write(`Validated ${fixtures.profiles.length} neutral local profile fixtures.\n`);
