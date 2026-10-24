# Etkinlik günü akışı — BlitzType (Monad Blitz Ankara v4)

**Teslim son saati: 16:30, [blitz.devnads.com](https://blitz.devnads.com)**. Repo linki, canlı demo linki ve kontrat adresi gerekiyor.
Gönderim, Monad'ın şehir reposunun (örn. `monad-developers/monad-blitz-<şehir>`) fork'lanmasıyla yapılıyor olabilir. Organizatöre sor; gerekirse kodu o fork'a taşırız.

## Uygunluk kontrol listesi
- [ ] Repo **public**, README İngilizce ve güncel (adres ve canlı link satırları dolu)
- [ ] Kontrat **bugün** Monad testnet'e deploy edildi ve doğrulandı
- [ ] Uygulama **web'de canlı** (Vercel). Localhost diskalifiye
- [ ] 90 saniyelik demo provası yapıldı (PITCH.md)

## Ağ
| | |
|---|---|
| Chain ID | 10143 |
| RPC | `https://testnet-rpc.monad.xyz` (50 rps, eth_call 25 rps) · `https://rpc.ankr.com/monad_testnet` · `https://rpc-testnet.monadinfra.com` |
| Explorer | testnet.monadvision.com · testnet.monadscan.com |
| MON | blitz.devnads.com (Tokens) · faucet.monad.xyz · devnads.com/agents (1 MON/istek, günde 10) |

⚠️ **10 MON rezerv kuralı:** Bakiyen 10 MON'un altındaysa, MON gönderen işlem ancak son 3 blokta başka işlem atmadıysan geçer. `npm run cards` bunu otomatik bekleyerek hallediyor. En rahatı: cüzdanda 10 MON + kart bütçesi.

## Sıra

**1. Kurulum**
```bash
git clone <repo> && cd <repo>/contracts && npm install
cp .env.example .env      # PRIVATE_KEY
npm test
```

**2. Prova (~0,2 MON):** `npm run rehearse` → çıktıdaki `WORD_GAS / NAME_GAS / FINISH_GAS` değerlerini `.env`'e yaz.

**3. Deploy + doğrulama:** `npm run deploy` → `app/src/deployment.json` commit + push. Sonra `npm run verify`. README'ye adresi yaz.

**4. Frontend:** Vercel → Add New Project → repo → **Root Directory `app`**. URL'yi `.env` → `APP_URL` ve README'ye yaz.

**5. Kartlar:** `.env`'de `PLAYERS`, `ROUNDS`, `WORDS` ayarla.
```bash
DRY_RUN=1 npm run cards   # maliyete bak
npm run cards             # out/cards-*.html → yazdır, kes
```
Ayrıca 20 bot kartı üret: `PLAYERS=20 npm run cards`. Simülasyon en son kart dosyasını kullanır, bu yüzden bot kartlarını **en son** üret. İnsan kartlarını ayrı sakla.

**6. Prova turu:** Telefonundan bir kartla gir, isim yaz. `WORDS=8 npm run round`, ardından `npm run simulate`. Projektörde `URL/#/screen` → **F**.

**7. Demo:**
- Kartları demodan önce dağıt (organizatörden izin al)
- Sahnede: `npm run round` (varsayılan 15 kelime, 45 sn, 5 sn geri sayım) + istersen `BOTS=20 npm run simulate`
- Bitince projektör podyumu gösterir; `npm run leaderboard` terminalden

## Sorun çıkarsa
| Belirti | Çözüm |
|---|---|
| Telefonda "Ağ şu an yoğun" | RPC limiti. Mobil veriye geç ya da Vercel'de `VITE_RPC_URLS` ile özel RPC ver |
| "Kartın gas bakiyesi bitti" | Yeni kart: `PLAYERS=5 npm run cards` |
| Kelime "zincirdekiyle eşleşmedi" | Uygulama zincirden kaldığı yeri alıp devam eder; yazmaya devam et |
| "Tur henüz başlamadı" | Geri sayım bitmeden yazıldı; 1 sn bekle |
| `startRound` revert (RoundLive) | Önceki tur bitmemiş: `END=1 npm run round` |
