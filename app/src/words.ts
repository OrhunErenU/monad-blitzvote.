// Same list as contracts/scripts/words.ts — used by the organizer panel to pick round words.
// Türkçe, sadece ASCII (ç/ş/ğ/ı/ö/ü yok): telefon klavyesi ve otomatik düzeltme sorun çıkarmasın.
// Hepsi küçük harf; kontrat birebir eşleşme ister.
export const WORDS = (
  "monad blok zincir hizli kod deniz kalem masa kitap bulut ankara tren yol hava gece sabah " +
  "kahve demo takim ekip fikir proje oyun klavye ekran sinyal kontrat cuzdan imza paralel " +
  "zaman saat dakika saniye kelime harf satir sayfa defter renk mavi mor beyaz siyah yesil " +
  "elma armut karpuz limon portakal kiraz ekmek peynir zeytin bal su ates toprak ruzgar " +
  "dag tepe vadi nehir gol orman agac yaprak cicek kedi kopek kus balik at aslan kartal " +
  "kale kapi pencere duvar cati merdiven bina sokak park meydan liman kopru tunel " +
  "hizmet ag dugum lider oylama sira kuyruk paket mesaj cevap soru sonuc hedef plan " +
  "yildiz gunes ay dunya uzay roket motor teker hiz enerji batarya devre kablo anten radar " +
  "basla bitir yaz gonder onay kazan kosu tur final rekor puan seviye bonus kombo"
).split(/\s+/).filter(Boolean);

export function pickWords(n: number, seed = Date.now()): string[] {
  // küçük deterministik PRNG (mulberry32) — tekrar yok
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
