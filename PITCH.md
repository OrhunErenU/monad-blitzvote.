# BlitzVote — 90 saniyelik demo

Kural: 90 sn, canlı, slayt gerekmez. Puanlama: Execution %24 · On-chain/Monad fit %20 · Topluluk oyu %20 · Problem %16 · Özgünlük %12 · Sunum %8. "Honest pitch" bir eleme kapısı: sadece çalışanı iddia et.

## Sahneye çıkmadan önce (hazırlık = sunumun yarısı)
- [ ] Laptop projektörde: `URL/#/screen` tam ekran (F), sahnede **BlitzVote** seçili (→)
- [ ] Telefonunda **seyirci** kartı açık, oy verilmemiş (oyu sahnede vereceksin)
- [ ] İkinci telefon/sekmede **takım** kartın (kendi projende oy düğmesi yok)
- [ ] Terminal hazır, komut yazılı, sadece Enter: `REACTIONS=5 npm run simulate`
- [ ] `npm run rehearse` sonucundaki gerçek sayıları aşağıdaki [köşeli] yerlere yaz

---

## Türkçe metin (~200 kelime ≈ 90 sn)

**[0–10 sn] Kanca: ekranı göster**
> "Arkamdaki sayı, bu ekran açıldığından beri bu salondan Monad'a yazılan işlemleri gösteriyor. Demolar sırasında bastığınız her emoji bir Monad işlemiydi."

**[10–25 sn] Ne?**
> "BlitzVote, demo gecesi için zincir üstü oylama. Girişte herkese bir QR kart veriliyor. Kart okutulunca gas'ı yüklü, kontrata kayıtlı bir cüzdan açılıyor: kurulum yok, imza penceresi yok. Kart başına tek oy var ve takımlar kendine oy veremiyor. Bu kurallar sunucuda değil, kontratta. Sayımı herkes zincirden okuyabiliyor."

**[25–55 sn] Canlı demo**
1. Telefonda **Oy ver → Onayla** → toast: *"Oyun zincirde ✓ [0.x] sn · tek istekte onay"*
   > "Monad'ın `eth_sendRawTransactionSync` metodu sayesinde oy tek istekte blokta, receipt beklemiyoruz."
2. Takım kartını göster:
   > "Kendi projemde oy düğmesi yok. Zorlasam da kontrat reddediyor."
3. Enter → simulate:
   > "Şimdi bütün kartlar aynı anda oy ve alkış gönderiyor."
   Ekranda çubuklar yükselir → *"tek blokta [N] işlem."*

**[55–80 sn] Neden Monad?**
> "Monad işlemleri paralel yürütüyor ve sadece aynı state'e dokunanları yeniden çalıştırıyor. Salonun tamamı aynı projeye oy verdiğinde tek bir sayaca yazmasın diye sayaçları 16 parçaya böldük. Alkışlar storage'a hiç yazmıyor, sadece event yayıyor, yani hiç çakışmıyor. Monad gas'ı limit üzerinden aldığı için limitleri ölçüp sıkı tuttuk: bir kart, 1 oy ve 15 alkışla [X] MON."

**[80–90 sn] Dürüst kapanış**
> "Bitmeyenler: oylar zincirde açık, gizli oy için sırada commit-reveal var. Kart da bir anahtar, o yüzden elden dağıtıyoruz. *[İstersen:]* TEDÜ Blockchain Topluluğu olarak bunu bir sonraki etkinliğimizde kullanacağız. Teşekkürler!"

---

## English version (if judges prefer English)

> "That number behind me is every transaction this room has sent to Monad since the screen opened. Every emoji you tapped during demos was a Monad transaction.
>
> BlitzVote is on-chain voting for demo night. Everyone gets a QR card. Scanning it opens a pre-funded, whitelisted burner wallet: no install, no pop-ups. One vote per card, and teams can't vote for themselves. Those rules live in the contract, and anyone can read the tally.
>
> *[vote on phone]* That vote landed in one request: Monad's `eth_sendRawTransactionSync` returns the receipt directly. *[team card]* My own project has no vote button, and the contract would reject it anyway. *[simulate]* Now every card votes and claps at once: [N] transactions in a single block.
>
> Why Monad: execution is optimistic and parallel, so we sharded the vote counters and made reactions storage-free, which means no conflicts. Gas is charged on the limit, so we measured and tightened it: a card with one vote and 15 claps costs [X] MON.
>
> What's not done: votes are public on-chain, so commit-reveal is next, and a card is a key, so we hand them out in person. Thanks!"

---

## Muhtemel sorular

**"Bunun için zaten blitz.devnads.com var."**
Evet, resmi oylama orada ve BlitzVote onun yerine geçmeyi iddia etmiyor. Bizim kattığımız üç şey var: kuralların kontratta olması ve sayımın zincirden doğrulanabilmesi, demo sırasında salonun canlı tepkisinin zincire yazılması ve bu sırada salonun kendisinin bir Monad yük testine dönüşmesi. Sonuçları bir etkinlik platformuna besleyebilir.

**"QR'ı fotoğraflayan başkasının oyunu kullanamaz mı?"**
Kullanabilir, çünkü kart = anahtar. Bu yüzden elden dağıtıyoruz. Sırada tek kullanımlık imzalı kodlar ve gas sponsorluğu var.

**"Shard'lama ölçülebilir fark yaratıyor mu?"**
Monad'ın paralel yürütmesi aynı slot'a yazan işlemleri yeniden çalıştırıyor. Shard'lama bu ortak yazmaları 16'ya bölüyor. Bugün Monad'da kontrollü bir A/B ölçümü yapmadık; bunu dürüstçe söyle, sayı uydurma.

**"Gas'ı kim ödüyor?"**
Organizatör, `registerVoters` ile tek işlemde kartlara MON dağıtıyor; artan kuruşlar organizatöre geri dönüyor. Monad'ın 10 MON rezerv kuralına göre fonlama işlemleri aralıklı gönderiliyor.

**"Neden toplu gönderim yapmıyorsunuz?"**
Herkesin kendi işlemini kendi imzalaması doğrulanabilirliğin ta kendisi. Toplu gönderim, güveni bir sunucuya devretmek demek.
