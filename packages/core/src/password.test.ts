import assert from "node:assert/strict";
import {
  generatePassword,
  normalizePasswordOptions,
  type PasswordGeneratorOptions,
} from "./password";

const SYMBOL_PATTERN = /[!@#$%^&*()\-_=[\]{};:,.?]/g;

function countSymbols(password: string): number {
  return password.match(SYMBOL_PATTERN)?.length ?? 0;
}

function predictableRandomBytes(length: number): Uint8Array {
  return new Uint8Array(length);
}

const defaultOptions = normalizePasswordOptions();
assert.equal(defaultOptions.symbolCount, 1);

const oneSymbolPassword = generatePassword(
  {
    length: 16,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
  },
  predictableRandomBytes,
);
assert.equal(countSymbols(oneSymbolPassword), 1);

const threeSymbolPassword = generatePassword(
  {
    length: 16,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
    symbolCount: 3,
  } satisfies PasswordGeneratorOptions,
  predictableRandomBytes,
);
assert.equal(countSymbols(threeSymbolPassword), 3);

const noSymbolOptions = normalizePasswordOptions({
  symbols: false,
  symbolCount: 4,
});
assert.equal(noSymbolOptions.symbolCount, 0);

console.log("password tests passed");
