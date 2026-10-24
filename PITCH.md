# BlitzVote — Pitch (≈2,5 dk) + demo senaryosu

## Sahneye çıkmadan önce
- [ ] Projektörde `#/screen` tam ekran (F), sahnedeki proje olarak **BlitzVote** seçili (→)
- [ ] Telefonunda kendi kartın açık (takım kartı: kendi projene oy düğmesi görünmemeli)
- [ ] Laptopta terminal hazır: `REACTIONS=5 npm run simulate`
- [ ] Salonda kartlar dağıtılmış (ideal: sabah girişte)

---

## Konuşma

**0:00 — Kanca (ekranı göster)**
> "Arkamdaki sayıya bakın. Şu an [X] işlem gösteriyor. Bunları siz attınız. Bugün her demoda emojilere bastığınızda, her dokunuşunuz bir Monad işlemiydi."

**0:20 — Problem**
> "Blitz'te kazananı salon seçiyor. Ama bu oylama genelde form, el kaldırma ya da Discord anketiyle yapılıyor. Bir kişi iki kez oy verebiliyor, takımlar kendine oy veriyor, sonucu da kimse doğrulayamıyor. Üstelik oylamayı bir **blokzincir** hackathonunda zincir dışında yapıyoruz."

**0:40 — Çözüm**
> "BlitzVote ile girişte herkese bir QR kart veriliyor. Kartı okuttuğunuzda telefonunuzda gas'ı yüklü, kontrata kayıtlı bir cüzdan açılıyor. Cüzdan kurmak yok, faucet yok, imza penceresi yok. Kart başına tek oy var ve takım kartları kendi projesine oy veremiyor. Bu kuralların hepsi kontratta, frontend'de değil."

**1:00 — Canlı demo**
1. Telefondan bir projeye **Oy ver → Onayla** → ekranda toast: *"Oyun zincirde ✓ 0.x sn · blok #…"*
   > "Oyum yarım saniye içinde blokta."
2. Kendi projende oy düğmesinin olmadığını göster.
   > "Kendi takımıma oy veremiyorum. Bunu kontrat reddediyor."
3. Laptopta `npm run simulate` çalıştır.
   > "Şimdi salondaki bütün kartlar aynı anda oy ve alkış gönderiyor."
   Ekranda blok çubukları ve **"blok başına rekor"** yükselir.

**1:40 — Neden Monad?**
> "Burada üç şey yaptık:
> **Bir:** Saniyenin altında blok süresi. Bu sayede 'oy verdim, gördüm' deneyimi anlık.
> **İki:** Monad işlemleri paralel yürütüyor. Herkes aynı saniyede aynı projeye oy verdiğinde tek bir sayaca yazarsa işlemler çakışır. Biz sayaçları adrese göre 16 parçaya böldük. Alkışlar ise storage'a hiç yazmıyor, sadece event yayıyor.
> **Üç:** Monad ücreti gas limitine göre alıyor. Biz de limitleri ölçüp sıkı tuttuk. Böylece 1 oy + 20 alkışlık bir kart birkaç kuruşa geliyor."

**2:10 — Sonraki adım**
> "Bugüne kadar 50'den fazla Blitz yapıldı. BlitzVote, Monad ekibinin her Blitz'te kullanabileceği hazır bir araç. *[Organizatörler gölge oylamayı kabul ettiyse:] Bu akşamki resmi oylamayla paralel çalıştırdık, sonuçları yan yana koyabiliriz.* Sırada tek kullanımlık imzalı kodlar, gas sponsoru ve gizli oy için commit-reveal var."

**2:30 — Kapanış**
> "Oylamayı zincire taşıdık, salonu da zincire taşıdık. Teşekkürler. Kartınızla bize de alkış atabilirsiniz 🙂"

---

## Muhtemel sorular

**"QR'ı fotoğraflayan başkasının oyunu kullanamaz mı?"**
Kullanabilir, çünkü kart = cüzdan. Bu yüzden kartları elden dağıtıyoruz. Bir sonraki sürümde tek kullanımlık, organizatör imzalı kodlar ve cihaza bağlı anahtar üretimi var.

**"Oylar gizli mi?"**
Ekranda kapanışa kadar gizli, zincirde değil. Bunu bilerek seçtik. Tek günlük bir demo için şeffaflık daha değerli. Gizlilik için commit-reveal yol haritasında.

**"Neden her oy için ayrı tx, toplu gönderim yapsanız?"**
Amaç "her insan kendi işlemini atıyor" deneyimi ve bunun Monad'da ucuz/hızlı olduğunu göstermek. Toplu gönderim, doğrulanabilirliği bir sunucuya devretmek demek.

**"Shard'lama gerçekten fark yaratıyor mu?"**
Aynı slot'a yazan işlemler paralel yürütmede çakışıyor. Shard'lama bu çakışmaları 16'ya bölüyor. Toplamı okumak 16 SLOAD'a mal oluyor ama bu bir view fonksiyonu, kimse gas ödemiyor. Kesin ölçüm için Monad'da yük testi yapmak bir sonraki adım. Bunu dürüstçe söyle, sayı uydurma.

**"Gas'ı kim ödüyor?"**
Organizatör, kartları kaydederken tek bir işlemle tüm kartlara MON dağıtıyor (`registerVoters` payable). Kalan kuruşlar organizatöre geri dönüyor.
