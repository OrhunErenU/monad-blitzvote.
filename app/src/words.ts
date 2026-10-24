// Same list as contracts/scripts/words.ts.
// English, lowercase ASCII. The pool size MUST be prime: the contract walks it with a
// seed-chosen stride, which only visits distinct words when the size is prime.
export const WORDS = (
  "time year people way day man thing woman life child world school state family student " +
  "group country problem hand part place case week company system program question work " +
  "government number night point home water room mother area money story fact month lot " +
  "right study book eye job word business issue side kind head house service friend father " +
  "power hour game line end member law car city community name president team minute idea " +
  "kid body information back parent face others level office door health person art war " +
  "history party result change morning reason research girl guy moment air teacher force " +
  "education foot boy age policy music market sense nation plan college interest death " +
  "course someone experience effort table space light river ocean forest mountain green " +
  "blue yellow orange purple silver gold stone glass paper pencil window garden bread apple " +
  "lemon cherry coffee sugar honey cloud storm thunder winter summer spring autumn rocket " +
  "planet orbit signal battery engine wheel bridge tunnel castle island desert valley tiger " +
  "eagle shark horse rabbit dragon pixel token block chain miner node ledger wallet speed " +
  "quick fast swift rapid sprint race final record score bonus combo crown trophy medal " +
  "winner player keyboard screen mouse cable laptop network packet socket thread proxy " +
  "cache folder button method object string vector "
).split(/\s+/).filter(Boolean);

export function pickWords(n: number, seed = Date.now()): string[] {
  // small deterministic PRNG (mulberry32), no repeats
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...new Set(WORDS)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/// Solo/room pool: passed to the BlitzType constructor in this exact order. Changing it needs a redeploy.
export const SOLO_POOL: string[] = [...new Set(WORDS)];
