# BlitzVote ⚡

**Hackathon seyirci oylaması, tamamen Monad üzerinde.** Girişte herkese bir QR kart veriliyor. Kart okutulunca telefon, gas'ı yüklenmiş ve kontrata kayıtlı bir burner cüzdanla açılıyor. Kişi tek oyunu veriyor, demolar sırasında da sınırsız alkış (emoji) gönderiyor. Projektörde her bloğa kaç işlem düştüğü canlı akıyor. Oylama kapanınca sonuçlar sondan başa doğru açılıyor.

> Monad Blitz Ankara · 24 Ekim 2026

## Neler var

| Parça | Ne yapıyor |
|---|---|
| `contracts/contracts/BlitzVote.sol` | Beyaz liste, kişi başı tek oy, kendi projene oy engeli, shard'lı sayaçlar, sadece event yayan tepkiler |
| `contracts/scripts/` | deploy · proje ekleme · burner + QR kart üretimi · oylama aç/kapa · durum · yük simülasyonu |
| `app/` (React + Vite + viem) | `#/` telefon oy ekranı, `#/screen` projektör ekranı |

**Kurallar zincirde:**
- Sadece organizatörün kaydettiği kartlar oy verebilir (`NotVoter`)
- Kart başına tek oy (`AlreadyVoted`)
- Takım kartları kendi projesine oy veremez (`OwnProject`)
- Oy yalnızca `Open` fazında verilebilir. Tepkiler `Setup` ve `Open` fazında açık.

**Monad'a özel tasarım:**
- **Shard'lı sayaçlar:** Oylar `votes[proje][adres % 16]` şeklinde tutuluyor. Salonda herkes aynı saniyede aynı projeye oy verse de hepsi tek bir storage slot'una yazmıyor. Monad işlemleri iyimser biçimde paralel yürütüyor; ortak slot'a yazan işlem azaldıkça çakışma ve yeniden yürütme de azalıyor.
- **Tepkiler storage'a hiç yazmıyor:** Sadece kontrol yapıp event yayıyorlar (~30k gas). Bu yüzden birbirleriyle çakışmıyorlar.
- **Gas limiti sıkı tutuluyor:** Monad ücreti kullanılan gas'a göre değil limite göre alıyor. Uygulama `estimateGas × 1.3` hesaplıyor, üst sınır olarak 250k (oy) ve 80k (tepki) kullanıyor. Kart fonlaması da aynı limitlere göre hesaplanıyor.

---

## Kurulum (laptopta, ~5 dk)

Gereken: Node 20+, test MON yüklü bir cüzdan (organizatör/deployer).

```bash
cd contracts
npm install
cp .env.example .env      # PRIVATE_KEY'i doldur
npm test                  # 11 test geçmeli
```

> Monad testnet RPC'sini ve chain ID'yi (varsayılan `https://testnet-rpc.monad.xyz`, `10143`) sabah workshop'ta mentorlardan teyit et. 80+ telefon aynı anda sorgulayacağı için mümkünse **özel bir RPC** (Alchemy/QuickNode vb.) al ve `MONAD_RPC_URL` ile `VITE_RPC_URL`'e onu yaz.

## Etkinlik günü akışı

### 1. Kontratı deploy et
```bash
npm run deploy
```
Bu komut `app/src/deployment.json` dosyasını yazar (adres, chain, deploy bloğu). Dosyayı **commit + push** et.

### 2. Frontend'i yayına al (Vercel)
Vercel → *Add New Project* → bu repo → **Root Directory: `app`** (Vite otomatik tanınıyor). Her push'ta yeniden deploy eder.
Çıkan adresi `contracts/.env` içine `APP_URL=` olarak yaz. QR'lar bu adresi açacak.

Alternatif: `deployment.json` yerine Vercel env değişkenleri kullanabilirsin (`app/.env.example`).

### 3. Projeleri ekle
`contracts/projects.json` dosyasını gerçek listeyle düzenle:
```json
[{ "name": "Proje adı", "team": "Takım adı", "members": 3 }]
```
```bash
npm run projects
```
⚠️ Projeler yalnızca **oylama açılmadan önce** eklenebilir. Dosyaya sonradan eklediğin projeler, komutu tekrar çalıştırınca eklenir; zincirdekiler atlanır.

### 4. QR kartlarını üret
`.env` içinde `AUDIENCE`, `TEAM_QR`, `REACTIONS` ayarla. Önce maliyeti gör:
```bash
DRY_RUN=1 npm run voters      # Windows PowerShell: $env:DRY_RUN=1; npm run voters
npm run voters
```
- `out/qr-*.html`: tarayıcıda aç, yazdır (A4'e 12 kart). Takım kartları koyu kenarlı.
- `out/voters-*.csv`: private key'ler. **`out/` commit edilmez.**
- Geç gelenler için: `TEAM_QR=0 AUDIENCE=10 npm run voters` (oylama açıkken de çalışır).

### 5. Demo saati
- Projektörde `<APP_URL>/#/screen` aç. **F** tam ekran, **← →** sahnedeki projeyi seçer.
- Alkışlar hemen başlar. Oylamayı aç:
  ```bash
  npm run open
  ```
- Son demodan sonra:
  ```bash
  npm run close     # sonra projektörde R → sonuçlar sondan başa açılır
  npm run status    # terminalden sonuç
  ```

### Prova / sahne anı
```bash
REACTIONS=5 npm run simulate    # en son CSV'deki tüm kartlardan aynı anda oy + tepki
```
Pitch sırasında projektör açıkken çalıştırırsan blok çubukları ve rekor sayacı canlı yükselir.

---

## Yerel geliştirme (testnet olmadan)

```bash
# terminal 1
cd contracts && npx hardhat node
# terminal 2
cd contracts
npm run deploy:local
npx hardhat run scripts/add-projects.ts --network localhost
AUDIENCE=20 TEAM_QR=1 npx hardhat run scripts/make-voters.ts --network localhost
PHASE=open npx hardhat run scripts/phase.ts --network localhost
# terminal 3
cd app && npm install && npm run dev     # http://localhost:5173/#/screen
```
CSV'deki bir key ile `http://localhost:5173/#/v/<privateKey>` aç → oy ekranı.

## Güvenlik notları (bilerek yapılan tercihler)
- **Oylar zincirde herkese açık.** Projektör sonucu kapanışa kadar göstermez ama kontratı okuyan görebilir. Gerçek gizlilik için commit-reveal gerekir (yol haritasında).
- **QR = cüzdan.** Kartı fotoğraflayan o oyu kullanabilir. Kartları elden dağıt. Key URL'nin `#` kısmında durduğu için sunucuya gitmez. Uygulama key'i okuduktan sonra adres çubuğundan siler.
- Burner'larda sadece birkaç kuruşluk test MON var.

## Yol haritası
- Kart yerine tek kullanımlık imzalı kodlar + gas sponsoru (relayer/paymaster)
- Commit-reveal ile gizli oy
- Birden fazla etkinlik için factory kontrat. Her Blitz'in kendi oylaması olur.
