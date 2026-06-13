export interface PasswordGeneratorOptions {
  length?: number;
  lowercase?: boolean;
  uppercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  avoidAmbiguous?: boolean;
}

export type RandomBytes = (length: number) => Uint8Array;

export const DEFAULT_PASSWORD_OPTIONS = {
  length: 20,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: true
} satisfies Required<PasswordGeneratorOptions>;

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";
const AMBIGUOUS = new Set("Il1O0o|`'\"".split(""));

interface CharacterGroup {
  enabled: boolean;
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

  if (normalized.length < groups.length) {
    throw new Error("Password length must be at least the number of enabled character groups.");
  }

  const pool = groups.map((group) => group.characters).join("");
  const requiredCharacters = groups.map((group) => pickCharacter(group.characters, randomBytes));
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

  return {
    length: Math.max(1, length),
    lowercase: options.lowercase ?? DEFAULT_PASSWORD_OPTIONS.lowercase,
    uppercase: options.uppercase ?? DEFAULT_PASSWORD_OPTIONS.uppercase,
    numbers: options.numbers ?? DEFAULT_PASSWORD_OPTIONS.numbers,
    symbols: options.symbols ?? DEFAULT_PASSWORD_OPTIONS.symbols,
    avoidAmbiguous: options.avoidAmbiguous ?? DEFAULT_PASSWORD_OPTIONS.avoidAmbiguous
  };
}

function getEnabledCharacterGroups(
  options: Required<PasswordGeneratorOptions>
): CharacterGroup[] {
  const groups: CharacterGroup[] = [
    { enabled: options.lowercase, characters: LOWERCASE },
    { enabled: options.uppercase, characters: UPPERCASE },
    { enabled: options.numbers, characters: NUMBERS },
    { enabled: options.symbols, characters: SYMBOLS }
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
