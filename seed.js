// CB2 Remix – configuration code ("CB2-XXXX-XXXX"): the chosen mods, music and ready-to-wear outfits in a few letters.
// Same format as cb2-decomp remix/modular.py (encode_config / decode_config):
// bytes [1] version, [2] mods (bit i = MOD_IDS[i]), [1] options (bit 0 = USA music), [2] outfits (bit i = skins/index.json[i]),
// trailing zero bytes dropped, then 1 check byte (crc32 & 255); Crockford base32.
const Seed = (() => {
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const IDS = ['unlock', 'special', 'hardmirror', 'riders', 'outfits', 'max', 'air', 'ramming', 'bam', 'progress', 'lift'];
  const crc = (u8) => { let c = ~0; for (const x of u8) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c >>> 0) & 255; };
  function encode({ mods = [], usMusic = false, skins = [] }) {
    const m = mods.reduce((a, f) => a | (IDS.includes(f) ? 1 << IDS.indexOf(f) : 0), 0), s = skins.reduce((a, i) => a | (1 << i), 0);
    const b = [1, m & 255, m >> 8, usMusic ? 1 : 0, s & 255, (s >> 8) & 255];
    while (b.length > 2 && b[b.length - 1] === 0) b.pop();
    b.push(crc(Uint8Array.from(b)));
    let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x);
    const nb = b.length * 8, k = Math.ceil(nb / 5); n <<= BigInt(k * 5 - nb);
    let out = ''; for (let i = k - 1; i >= 0; i--) out += B32[Number((n >> BigInt(5 * i)) & 31n)];
    return 'CB2-' + out.match(/.{1,4}/g).join('-');
  }
  function decode(code) {
    let s = String(code).toUpperCase().trim(); if (s.startsWith('CB2')) s = s.slice(3);
    s = s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[-\s]/g, '');
    if (!s || [...s].some((c) => !B32.includes(c))) return null;
    let n = 0n; for (const c of s) n = n * 32n + BigInt(B32.indexOf(c));
    const nb = Math.floor(s.length * 5 / 8); n >>= BigInt(s.length * 5 - nb * 8);
    const b = []; for (let i = nb - 1; i >= 0; i--) b.push(Number((n >> BigInt(8 * i)) & 255n));
    if (b.length < 2 || b[0] !== 1 || crc(Uint8Array.from(b.slice(0, -1))) !== b[b.length - 1]) return null;
    const v = b.slice(0, -1).concat([0, 0, 0, 0, 0, 0]), m = v[1] | (v[2] << 8), sk = v[4] | (v[5] << 8);
    return { mods: IDS.filter((f, i) => (m >> i) & 1), usMusic: !!(v[3] & 1), skins: [...Array(16).keys()].filter((i) => (sk >> i) & 1) };
  }
  return { IDS, encode, decode };
})();
if (typeof module !== 'undefined') module.exports = Seed;
