const CURRENCY_CODE = /^[A-Z]{3}$/;
const DECIMAL_AMOUNT = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

function currencyFractionDigits(currency: string, locale: string): number {
  if (!CURRENCY_CODE.test(currency)) {
    throw new RangeError(`Invalid currency code: ${currency}`);
  }

  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  if (digits === undefined) {
    throw new RangeError(`Unable to determine minor-unit precision for ${currency}.`);
  }
  return digits;
}

export function parseMoneyToMinor(amount: string, currency = 'KES', locale = 'en-KE'): bigint {
  const match = DECIMAL_AMOUNT.exec(amount);
  if (!match) {
    throw new TypeError('Amount must be a plain decimal string without grouping separators.');
  }

  const sign = match[1] ?? '';
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const digits = currencyFractionDigits(currency, locale);
  if (fraction.length > digits) {
    throw new RangeError(`${currency} supports at most ${digits} fractional digits.`);
  }

  const scale = 10n ** BigInt(digits);
  const fractionalMinor = fraction.length === 0 ? 0n : BigInt(fraction.padEnd(digits, '0'));
  const absoluteMinor = BigInt(whole) * scale + fractionalMinor;
  return sign === '-' ? -absoluteMinor : absoluteMinor;
}

export function formatMoney(amountMinor: bigint, currency = 'KES', locale = 'en-KE'): string {
  const digits = currencyFractionDigits(currency, locale);
  const scale = 10n ** BigInt(digits);
  const absoluteMinor = amountMinor < 0n ? -amountMinor : amountMinor;
  const whole = absoluteMinor / scale;
  const remainder = absoluteMinor % scale;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const numberForParts = amountMinor < 0n ? (whole === 0n ? -1n : -whole) : whole;
  const localizedFraction =
    digits === 0
      ? ''
      : new Intl.NumberFormat(locale, {
          useGrouping: false,
          minimumIntegerDigits: digits,
          maximumFractionDigits: 0,
        }).format(Number(remainder));

  return formatter
    .formatToParts(numberForParts)
    .map((part) => {
      if (part.type === 'integer' && amountMinor < 0n && whole === 0n) {
        return new Intl.NumberFormat(locale, { useGrouping: false }).format(0);
      }
      return part.type === 'fraction' ? localizedFraction : part.value;
    })
    .join('');
}
