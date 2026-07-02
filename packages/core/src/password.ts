export interface PasswordGeneratorOptions {
  length?: number;
  lowercase?: boolean;
  uppercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  symbolCount?: number;
  avoidAmbiguous?: boolean;
}

export type RandomBytes = (length: number) => Uint8Array;

export const DEFAULT_PASSWORD_OPTIONS = {
  length: 20,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  symbolCount: 1,
  avoidAmbiguous: true
} satisfies Required<PasswordGeneratorOptions>;

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";
const AMBIGUOUS = new Set("Il1O0o|`'\"".split(""));

interface CharacterGroup {
  enabled: boolean;
  kind: "lowercase" | "uppercase" | "numbers" | "symbols";
  characters: string;
}

export function generatePassword(
  options: PasswordGeneratorOptions = {},
  randomBytes: RandomBytes = getCryptoRandomBytes
): string {
  const normalized = normalizePasswordOptions(options);
  const groups = getEnabledCharacterGroups(normalized);

  if (groups.length === 0) {
    throw new Error("At least one password character group must be enabled.");
  }

  const nonSymbolGroups = groups.filter((group) => group.kind !== "symbols");
  const symbolGroup = groups.find((group) => group.kind === "symbols");
  const requiredSymbolCount = symbolGroup ? normalized.symbolCount : 0;
  const requiredCharacterCount = nonSymbolGroups.length + requiredSymbolCount;

  if (normalized.length < requiredCharacterCount) {
    throw new Error("Password length must be at least the number of required characters.");
  }

  const pool =
    nonSymbolGroups.map((group) => group.characters).join("") ||
    symbolGroup?.characters ||
    "";
  const requiredCharacters = [
    ...nonSymbolGroups.map((group) => pickCharacter(group.characters, randomBytes)),
    ...Array.from({ length: requiredSymbolCount }, () =>
      pickCharacter(symbolGroup?.characters ?? "", randomBytes)
    )
  ];
  const remainingLength = normalized.length - requiredCharacters.length;
  const characters = [
    ...requiredCharacters,
    ...Array.from({ length: remainingLength }, () => pickCharacter(pool, randomBytes))
  ];

  return shuffleCharacters(characters, randomBytes).join("");
}

export function estimatePasswordEntropyBits(options: PasswordGeneratorOptions = {}): number {
  const normalized = normalizePasswordOptions(options);
  const poolSize = getEnabledCharacterGroups(normalized).reduce(
    (size, group) => size + group.characters.length,
    0
  );

  if (poolSize === 0) {
    return 0;
  }

  return Math.round(normalized.length * Math.log2(poolSize) * 10) / 10;
}

export function normalizePasswordOptions(
  options: PasswordGeneratorOptions = {}
): Required<PasswordGeneratorOptions> {
  const length = Math.trunc(options.length ?? DEFAULT_PASSWORD_OPTIONS.length);
  const normalizedLength = Math.max(1, length);
  const symbols = options.symbols ?? DEFAULT_PASSWORD_OPTIONS.symbols;

  return {
    length: normalizedLength,
    lowercase: options.lowercase ?? DEFAULT_PASSWORD_OPTIONS.lowercase,
    uppercase: options.uppercase ?? DEFAULT_PASSWORD_OPTIONS.uppercase,
    numbers: options.numbers ?? DEFAULT_PASSWORD_OPTIONS.numbers,
    symbols,
    symbolCount: normalizeSymbolCount(
      options.symbolCount ?? DEFAULT_PASSWORD_OPTIONS.symbolCount,
      normalizedLength,
      symbols
    ),
    avoidAmbiguous: options.avoidAmbiguous ?? DEFAULT_PASSWORD_OPTIONS.avoidAmbiguous
  };
}

function normalizeSymbolCount(
  symbolCount: number,
  length: number,
  symbolsEnabled: boolean
): number {
  if (!symbolsEnabled) return 0;
  if (!Number.isFinite(symbolCount)) return DEFAULT_PASSWORD_OPTIONS.symbolCount;
  return Math.min(Math.max(0, Math.trunc(symbolCount)), Math.max(0, length));
}

function getEnabledCharacterGroups(
  options: Required<PasswordGeneratorOptions>
): CharacterGroup[] {
  const groups: CharacterGroup[] = [
    { enabled: options.lowercase, kind: "lowercase", characters: LOWERCASE },
    { enabled: options.uppercase, kind: "uppercase", characters: UPPERCASE },
    { enabled: options.numbers, kind: "numbers", characters: NUMBERS },
    { enabled: options.symbols, kind: "symbols", characters: SYMBOLS }
  ];

  return groups
    .filter((group) => group.enabled)
    .map((group) => ({
      ...group,
      characters: options.avoidAmbiguous ? removeAmbiguousCharacters(group.characters) : group.characters
    }))
    .filter((group) => group.characters.length > 0);
}

function removeAmbiguousCharacters(characters: string): string {
  return Array.from(characters)
    .filter((character) => !AMBIGUOUS.has(character))
    .join("");
}

function pickCharacter(characters: string, randomBytes: RandomBytes): string {
  return characters[randomInt(characters.length, randomBytes)] ?? "";
}

function shuffleCharacters(characters: string[], randomBytes: RandomBytes): string[] {
  const shuffled = [...characters];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1, randomBytes);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] ?? "", shuffled[index] ?? ""];
  }

  return shuffled;
}

function randomInt(maxExclusive: number, randomBytes: RandomBytes): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 256) {
    throw new Error("Random integer upper bound must be between 1 and 256.");
  }

  const maxUnbiased = Math.floor(256 / maxExclusive) * maxExclusive;
  let value = 256;

  while (value >= maxUnbiased) {
    value = randomBytes(1)[0] ?? 256;
  }

  return value % maxExclusive;
}

function getCryptoRandomBytes(length: number): Uint8Array {
  const cryptoProvider = globalThis.crypto;

  if (!cryptoProvider?.getRandomValues) {
    throw new Error("Secure random generation requires globalThis.crypto.getRandomValues.");
  }

  const bytes = new Uint8Array(length);
  cryptoProvider.getRandomValues(bytes);
  return bytes;
}
