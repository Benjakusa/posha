import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoneyToMinor } from '../src/money.js';
import { CurrencySchema, MoneyMinorDtoSchema } from '../src/schemas.js';

describe('minor-unit money utilities', () => {
  it('[P0-03] parses KES decimal strings without using floating point', () => {
    expect(parseMoneyToMinor('1234.56')).toBe(123456n);
    expect(parseMoneyToMinor('-0.01')).toBe(-1n);
  });

  it('[P0-03] formats KES with localized grouping and two decimal digits', () => {
    expect(formatMoney(123456n)).toBe('KES 1,234.56');
    expect(formatMoney(-1n)).toBe('-KES 0.01');
  });

  it('[P0-03] uses the currency minor-unit precision', () => {
    expect(parseMoneyToMinor('123', 'JPY')).toBe(123n);
    expect(formatMoney(123n, 'JPY', 'en-US')).toBe('JPY 123');
    expect(parseMoneyToMinor('1.234', 'KWD')).toBe(1234n);
  });

  it('[P0-03] rejects excess precision, grouping, and non-decimal input', () => {
    expect(() => parseMoneyToMinor('1.001')).toThrow(RangeError);
    expect(() => parseMoneyToMinor('1,000.00')).toThrow(TypeError);
    expect(() => parseMoneyToMinor('1.2.3')).toThrow(TypeError);
  });

  it('[P0-03] keeps JSON money amounts in the safe integer range', () => {
    expect(CurrencySchema.safeParse('KES').success).toBe(true);
    expect(CurrencySchema.safeParse('kes').success).toBe(false);
    expect(MoneyMinorDtoSchema.safeParse(500).success).toBe(true);
    expect(MoneyMinorDtoSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
    expect(MoneyMinorDtoSchema.safeParse(5.5).success).toBe(false);
  });
});
