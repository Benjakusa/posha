import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const tokensUrl = new URL('../../config/src/tokens.json', import.meta.url);
const pairsUrl = new URL('../contrast-pairs.json', import.meta.url);

export function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g);
  if (!/^#[\da-f]{6}$/i.test(hex) || channels === null) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }

  const linearChannels = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2];
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function findContrastFailures(tokens, pairs) {
  return pairs.flatMap((pair) => {
    const foreground = tokens[pair.foreground];
    const background = tokens[pair.background];
    if (!foreground || !background) {
      return [{ ...pair, reason: 'references an unknown token' }];
    }

    const ratio = contrastRatio(foreground, background);
    return ratio >= pair.minimum ? [] : [{ ...pair, ratio }];
  });
}

async function main() {
  const tokens = JSON.parse(await readFile(tokensUrl, 'utf8'));
  const pairs = JSON.parse(await readFile(pairsUrl, 'utf8'));
  const failures = findContrastFailures(tokens, pairs);

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(
        `${failure.foreground} on ${failure.background}: ${failure.ratio?.toFixed(2) ?? failure.reason} (minimum ${failure.minimum}:1)\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Contrast check passed for ${pairs.length} token pairs.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
