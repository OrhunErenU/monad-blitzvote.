import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { ethers } from "hardhat";
import {
  EMPTYING_GAP_MS, FINISH_GAS_LIMIT, getContract, getFees, NAME_GAS_LIMIT, RESERVE_MON, sleep, WORD_GAS_LIMIT,
} from "./lib";

/**
 * Oyuncu kartları: burner cüzdan üretir, gas parası yükler, yazdırılabilir QR sayfası çıkarır.
 * Env: PLAYERS=40  ROUNDS=3  WORDS=15  APP_URL=https://...  DRY_RUN=1
 */
const BATCH = 40;

async function main() {
  const players = Number(process.env.PLAYERS ?? 40);
  const rounds = BigInt(process.env.ROUNDS ?? 3);
  const words = BigInt(process.env.WORDS ?? 15);
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const dryRun = process.env.DRY_RUN === "1";

  const bt = await getContract();
  const [org] = await ethers.getSigners();

  const fees = await getFees();
  const price = process.env.GAS_PRICE_GWEI ? ethers.parseUnits(process.env.GAS_PRICE_GWEI, "gwei") : fees.maxFeePerGas;
  const gasPerPlayer = NAME_GAS_LIMIT + rounds * ((words - 1n) * WORD_GAS_LIMIT + FINISH_GAS_LIMIT);
  const perPlayer = (price * gasPerPlayer * 11n) / 10n;
  const funding = perPlayer * BigInt(players);
  const fundGas = (fees.base * 2n + fees.maxPriorityFeePerGas) * 40_000n * BigInt(players);
  const total = funding + fundGas;
  const balance = await ethers.provider.getBalance(org.address);

  console.log(`Kart: ${players} · ${rounds} tur × ${words} kelime`);
  console.log(`Taban ücret ${ethers.formatUnits(fees.base, "gwei")} gwei · imza fiyatı ${ethers.formatUnits(price, "gwei")} gwei`);
  console.log(`Kişi başı: ${ethers.formatEther(perPlayer)} MON (${gasPerPlayer} gas)`);
  console.log(`Toplam ≤ ${ethers.formatEther(total)} MON   Bakiyen: ${ethers.formatEther(balance)} MON`);
  if (balance - total < RESERVE_MON) {
    console.log(`Not: bakiye 10 MON rezervin altına iniyor → her fonlama tx'inden önce ${EMPTYING_GAP_MS / 1000} sn bekleniyor (Monad "emptying" istisnası).`);
  }
  if (dryRun) return;
  if (balance < total) throw new Error("Bakiye yetmiyor — PLAYERS/ROUNDS/WORDS'ü düşür ya da blitz.devnads.com / faucet'ten MON al.");

  const wallets = Array.from({ length: players }, () => ethers.Wallet.createRandom());
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(
    path.join(outDir, `players-${stamp}.csv`),
    ["address,privateKey", ...wallets.map((w) => `${w.address},${w.privateKey}`)].join("\n")
  );

  for (let i = 0; i < wallets.length; i += BATCH) {
    const chunk = wallets.slice(i, i + BATCH);
    await sleep(EMPTYING_GAP_MS);
    const tx = await bt.fund(chunk.map((w) => w.address), { value: perPlayer * BigInt(chunk.length) });
    await tx.wait();
    console.log(`Fonlandı: ${chunk.length} kart (tx ${tx.hash})`);
  }

  const cards = await Promise.all(
    wallets.map(async (w, i) => {
      const qr = await QRCode.toDataURL(`${appUrl}/#/p/${w.privateKey}`, { margin: 1, width: 360, errorCorrectionLevel: "M" });
      return `<div class="card"><div class="top"><b>Blitz<span>Type</span></b><span>#${i + 1}</span></div>
<img src="${qr}" alt="QR"/><div class="hint">Okut · adını yaz · yarış başlayınca yaz!</div>
<div class="addr">${w.address.slice(0, 6)}…${w.address.slice(-4)}</div></div>`;
    })
  );
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>BlitzType kartları</title><style>
@page{size:A4;margin:10mm}body{font-family:system-ui,sans-serif;margin:0;color:#120b2e}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.card{border:1.5px dashed #b9aef7;border-radius:4mm;padding:4mm;text-align:center;break-inside:avoid}
.top{display:flex;justify-content:space-between;font-size:11pt}.top span{color:#888}.top b span{color:#6e54f7}
img{width:100%;max-width:48mm;margin:2mm auto;display:block}.hint{font-size:8.5pt;color:#555}.addr{font-family:monospace;font-size:7.5pt;color:#999;margin-top:1mm}
</style></head><body><div class="grid">${cards.join("\n")}</div></body></html>`;
  const htmlPath = path.join(outDir, `cards-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`\nKartlar: ${htmlPath} (tarayıcıda aç → yazdır)\nAnahtarlar: out/players-${stamp}.csv — out/ commit edilmez.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
