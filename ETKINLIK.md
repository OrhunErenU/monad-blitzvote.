# Etkinlik günü akışı (Monad Blitz Ankara v4)

**Teslim son saati: 16:30, [blitz.devnads.com](https://blitz.devnads.com)** — repo linki + canlı demo linki + kontrat adresi.

## Uygunluk kontrol listesi (sunumdaki kurallar)
- [ ] Repo **public**, README var (README.md İngilizce, jüri için)
- [ ] Kontrat **bugün** Monad testnet'e deploy edildi (prova deploy'u da bugün sayılır, ama asıl adresi teslim et)
- [ ] Uygulama **web'de canlı** (Vercel). Localhost diskalifiye
- [ ] 90 saniyelik canlı demo hazır (PITCH.md)

## Ağ bilgileri (docs.monad.xyz/developer-essentials/testnet)
| | |
|---|---|
| Chain ID | 10143 |
| RPC | `https://testnet-rpc.monad.xyz` (50 rps, eth_call 25 rps) · `https://rpc.ankr.com/monad_testnet` · `https://rpc-testnet.monadinfra.com` (20 rps) |
| Explorer | testnet.monadvision.com · testnet.monadscan.com |
| MON | blitz.devnads.com (Tokens) · faucet.monad.xyz · devnads.com/agents (1 MON/istek, günde 10) |

⚠️ **10 MON rezerv kuralı:** Bakiyen 10 MON'un altındaysa (ya da işlem seni 10'un altına düşürecekse), value içeren işlem ancak son 3 blokta başka işlem atmadıysan geçer. `npm run voters` her fonlama tx'inden önce 2,5 sn bekleyerek bunu otomatik yapıyor. Yine de **organizatör cüzdanında 10 MON + kart bütçesi** olması en rahatı.

## Sıra

### 1. Kurulum (5 dk)
```bash
git clone <repo> && cd <repo>/contracts
npm install
cp .env.example .env     # PRIVATE_KEY yaz
npm test
```

### 2. Prova (1 dk, ~0,2 MON): gerçek gas'ı ölç
```bash
npm run rehearse
```
Çıktıdaki `VOTE_GAS=` / `REACT_GAS=` satırlarını `.env`'e yaz. `sync onay: VAR ✓` görmen lazım. Görmezsen de çalışır, sadece polling'e düşer.

### 3. Asıl deploy + doğrulama
```bash
npm run deploy           # app/src/deployment.json yazılır → commit + push
npm run verify           # MonadVision'da kodu doğrular
```
README'deki "Contract address" satırına adresi yaz.

### 4. Frontend → Vercel
Vercel → Add New Project → repo → **Root Directory: `app`**. Push'ta otomatik deploy.
Çıkan URL'yi `.env` → `APP_URL=` ve README'deki "Live demo" satırına yaz.
Telefondan `URL/#/screen` ve `URL` açılıyor mu, kontrol et.

### 5. Projeler
`projects.json`'a organizatörlerden aldığın **tam listeyi** yaz (`members` = takım kişi sayısı), sonra:
```bash
npm run projects
```
⚠️ Oylama açıldıktan sonra proje eklenemez. Geç gelen takım varsa oylamayı açmadan önce ekle.

### 6. Kartlar
```bash
DRY_RUN=1 npm run voters     # maliyete bak
npm run voters               # out/qr-*.html → yazdır, kes, dağıt
```
- Takım kartları koyu kenarlı ve takım adı yazıyor. Doğru takıma ver.
- Geç gelenler: `.env`'de `TEAM_QR=0`, `AUDIENCE=10` → `npm run voters` (oylama açıkken de olur)
- **Kartları demolardan önce dağıt** (öğle arası ideal). Organizatörlerden izin al.

### 7. Demolar
- Projektör/laptop: `URL/#/screen` → **F** tam ekran
- Her demoda **→** ile sahnedeki projeyi seç: alkış ölçer o projeyi parlatır
- Oylamayı aç: `npm run open` (alkışlar zaten açık)
- Son demodan sonra: `npm run close` → projektörde **R** (sonuçlar sondan başa)

### Sorun çıkarsa
| Belirti | Çözüm |
|---|---|
| Telefonda "Ağ şu an yoğun" | RPC limiti; birkaç sn sonra tekrar. Kalıcıysa Vercel'de `VITE_RPC_URLS` ile özel RPC ekle |
| "Kartın gas bakiyesi bitti" | Yeni kart ver (`AUDIENCE=5 TEAM_QR=0 npm run voters`) |
| `registerVoters` revert | Bakiye/rezerv: daha fazla MON al ya da `AUDIENCE`/`REACTIONS` düşür |
| Projektör sayaç artmıyor | Sayfayı yenile; sayaç ekran açıldıktan sonraki işlemleri sayar |
