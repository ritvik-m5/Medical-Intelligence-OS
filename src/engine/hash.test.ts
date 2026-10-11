import { describe, expect, it } from 'vitest';
import { sha256, shortHash } from './hash';

/* ------------------------------------------------------------------ */
/* The hash                                                            */
/*                                                                    */
/* Asserted against the published FIPS 180-4 vectors, because a hash    */
/* that is subtly wrong is worse than no hash: it produces identities   */
/* that look authoritative and are not. The interesting cases are the   */
/* boundaries — empty input, the padding threshold at 55/56 bytes, and  */
/* multi-byte UTF-8, where a naive implementation silently drifts.      */
/* ------------------------------------------------------------------ */

const VECTORS: Array<[string, string]> = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  ],
  [
    'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
    'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
  ],
  ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
  ['a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
  ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
  ['a'.repeat(1000), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'],
];

describe('sha256', () => {
  it('matches the published vectors', () => {
    for (const [input, expected] of VECTORS) {
      expect(sha256(input)).toBe(expected);
    }
  });

  it('always produces 64 lowercase hex characters', () => {
    for (const [input] of VECTORS) {
      expect(sha256(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('encodes multi-byte characters rather than their code units', () => {
    // Two bytes, not one: a naive implementation hashing charCodeAt() drifts here.
    expect(sha256('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
    expect(sha256('é')).not.toBe(sha256('e'));
    // Beyond the BMP: a surrogate pair must become one code point, not two.
    expect(sha256('😀')).toBe('f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9');
    expect(sha256('😀')).not.toBe(sha256('\ud83d\ude00'.slice(0, 1)));
  });

  it('is deterministic and sensitive to a single character', () => {
    expect(sha256('Alex Morgan')).toBe(sha256('Alex Morgan'));
    expect(sha256('Alex Morgan')).not.toBe(sha256('Alex Morga'));
    expect(sha256('Alex Morgan')).not.toBe(sha256('Alex  Morgan'));
  });
});

describe('shortHash', () => {
  it('produces eight hex characters and is deterministic', () => {
    expect(shortHash('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(shortHash('abc')).toBe(shortHash('abc'));
    expect(shortHash('abc')).not.toBe(shortHash('abd'));
  });
});
