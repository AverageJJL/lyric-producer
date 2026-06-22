import {canonicalJsonStringify} from './canonicalJson';

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MASK_64 = 0xffffffffffffffffn;

function fnv1a64(text: string): string {
  let hash = FNV_OFFSET_64;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function canonicalJsonFingerprint(value: unknown): string {
  return `apc-${fnv1a64(canonicalJsonStringify(value))}`;
}
