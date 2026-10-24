# BlitzType — 90 saniyelik demo

Kural: 90 sn, canlı, slayt yok. Puan: Execution %24 · On-chain/Monad fit %20 · Topluluk oyu %20 · Problem %16 · Özgünlük %12 · Sunum %8. **Dürüst pitch** bir eleme kapısı: sadece çalışanı iddia et.

## Sahneden önce
- [ ] Projektör: `URL/#/screen`, **F** ile tam ekran
- [ ] Salonda kartlar dağıtıldı, insanlar isimlerini girdi (öğle arası ideal)
- [ ] Terminalde iki komut hazır, sadece Enter: `npm run round` ve `npm run simulate`
- [ ] `npm run rehearse` sonuçlarını [köşeli] yerlere yaz

---

## Türkçe metin (~200 kelime)

**[0–10 sn] Kanca**
> "Elinizdeki kartı okutun. 10 saniye sonra hep birlikte yarışıyoruz. Her doğru yazdığınız kelime bir Monad işlemi."

*(Enter → `npm run round`. Projektörde geri sayım başlar.)*

**[10–45 sn] Canlı yarış: salon oynuyor**
> "Telefonunuzdaki kelimeyi yazın. Arkada her çubuk bir Monad bloğu ve her blokta onaylanan kelimeler görünüyor. Şu an bu salon saniyede [N] işlem üretiyor. Kim önde, onu sunucu değil zincir belirliyor."

*(Salon az ise: Enter → `npm run simulate`, 20 bot katılır.)*

**[45–70 sn] Neden zincir, neden Monad?**
> "Yazdığınız kelime kontrata gidiyor ve kontrat hash'iyle karşılaştırıyor. Kelime atlayamazsınız, sahte ilerleme gösteremezsiniz; bitiş sırası konsensüsle kesinleşiyor. Bunu 12 saniyelik bloklu bir zincirde yapsaydık bütün yarış 4 bloğa sığardı. Monad'da her kelime ~[0.3] saniyede blokta: Monad'ın `eth_sendRawTransactionSync` metodu her kelimeyi tek istekte onaylıyor. Paralel yürütmede çakışma olmasın diye her oyuncu sadece kendi storage slot'una yazıyor."

**[70–90 sn] Podyum + dürüst kapanış**
> *(Podyum görünür.)* "Kazanan [isim], [X] blokta. Daha önce TypeStrike 1v1 düelloyu WebRTC'de yapıp zinciri bahis için kullanmıştı. Biz oyunun kendisini zincire koyduk, bütün salon için. Bitmeyen: bu bir botun insan olmadığını kanıtlamıyor; kanıtladığı şey sıranın ve doğruluğun hilesiz olması. Teşekkürler!"

---

## English version
> "Scan the card in your hand. In ten seconds we all race. Every correct word you type is a Monad transaction.
> *[round starts]* Type the word on your phone. Each bar behind me is one Monad block and the words confirmed in it. Right now this room is pushing [N] transactions per second, and the chain, not a server, decides who's ahead.
> Each word goes to the contract, which checks it against a hash. You can't skip a word or fake progress, and finish order is settled by consensus. On a 12-second chain this whole race would fit in four blocks. On Monad each word lands in about [0.3] seconds, confirmed in a single call with `eth_sendRawTransactionSync`. Every player writes only their own storage slot, so parallel execution never conflicts.
> *[podium]* [Name] wins in [X] blocks. TypeStrike did a 1v1 duel over WebRTC with the chain as escrow. We put the game itself on-chain, for the whole room. What it doesn't prove: that you're human. What it does prove: order and correctness can't be faked. Thanks!"

---

## Muhtemel sorular
**"TypeStrike zaten var."** Orada oyun WebRTC'de, zincir sadece bahis parası. Bizde her kelime zincirde doğrulanıyor ve sırayı konsensüs belirliyor; 1v1 değil bütün salon oynuyor, bahis yok.

**"Bot hile yapamaz mı?"** Kelime atlayamaz ve sahte ilerleme gösteremez, ama insandan hızlı yazabilir. İnsan doğrulaması (passkey/World ID gibi) sonraki adım.

**"Aynı bloktaki iki kişiden kim önde?"** Bloktaki işlem sırası; onu da blok lideri belirliyor. Bunu açıkça söylüyoruz.

**"Gas kimin?"** Organizatör tek işlemle kartlara dağıtıyor (`fund`). Kelime başı gas [rehearse sonucu], kart başı [X] MON.

**"Neden her kelime ayrı işlem?"** Sıranın ve doğruluğun zincirde kesinleşmesi için. Bu aynı zamanda Monad'ın saniyede bu kadar işlemi kaldırdığının canlı gösterimi.
