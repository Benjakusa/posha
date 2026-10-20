import { access, readFile } from 'node:fs/promises';

const featureSpec = new URL('../docs/spec/06_FEATURE_SPECS.md', import.meta.url);
const testRoots = ['apps', 'packages'];

await access(featureSpec);
for (const root of testRoots) {
  await access(new URL(`../${root}`, import.meta.url));
}

const specText = await readFile(featureSpec, 'utf8');
const acceptanceIds = [
  ...new Set(
    specText.match(/\b(?:AUTH|AGE|PRO|CON|VID|PAY|CRE|SUB|LIV|REQ|MOD|ADM|NOT)-\d{2}\b/g) ?? [],
  ),
];

if (acceptanceIds.length === 0) {
  throw new Error('No acceptance IDs found in docs/spec/06_FEATURE_SPECS.md');
}

console.log(
  `Found ${acceptanceIds.length} acceptance IDs. Test mapping is scaffolded and will be enforced with feature test suites.`,
);
