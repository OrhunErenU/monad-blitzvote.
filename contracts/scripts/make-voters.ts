import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { ethers } from "hardhat";
import { EMPTYING_GAP_MS, getContract, getFees, REACT_GAS_LIMIT, RESERVE_MON, sleep, VOTE_GAS_LIMIT } from "./lib";

/**
 * Burner cüzdan üretir, kontrata kaydeder, gas parası yükler ve yazdırılabilir QR kartları çıkarır.
 *
 * Env:
 *   AUDIENCE=60          seyirci QR sayısı
 *   TEAM_QR=1            projects.json'daki "members" sayısı kadar takım QR'ı da üret (ilk çalıştırmada)
 *   APP_URL=https://...  QR'ların açacağı uygulama adresi (Vercel linkin)
 *   REACTIONS=15         kişi başı kaç tepki atabilecek kadar gas yüklensin
 *   VOTE_GAS / REACT_GAS işlem başı beklenen gas (npm run rehearse ölçer)
 *   DRY_RUN=1            sadece maliyeti hesapla, hiçbir şey gönderme
 */

const BATCH = 40;

type Burner = { address: string; privateKey: string; teamPlusOne: number; label: string };

async function main() {
  const audience = Number(process.env.AUDIENCE ?? 60);
  const teamQr = process.env.TEAM_QR === "1";
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const reactions = BigInt(process.env.REACTIONS ?? 15);
  const dryRun = process.env.DRY_RUN === "1";

  const bv = await getContract();
  const [organizer] = await ethers.getSigners();
  const onchainProjects = await bv.getProjects();

  const burners: Burner[] = [];
  const mk = (teamPlusOne: number, label: string) => {
    const w = ethers.Wallet.createRandom();
    burners.push({ address: w.address, privateKey: w.privateKey, teamPlusOne, label });
  };
  for (let i = 0; i < audience; i++) mk(0, "Seyirci");

  if (teamQr) {
    const file = process.env.PROJECTS_FILE || path.join(__dirname, "..", "projects.json");
    const projects: { name: string; team: string; members?: number }[] = JSON.parse(fs.readFileSync(file, "utf8"));
    projects.forEach((p, i) => {
      if (i >= onchainProjects.length) throw new Error(`"${p.name}" zincirde yok — önce add-projects çalıştır.`);
      for (let m = 0; m < (p.members ?? 0); m++) mk(i + 1, `Takım: ${p.team} (${p.name})`);
    });
  }
  if (burners.length === 0) throw new Error("Üretilecek QR yok (AUDIENCE=0 ve TEAM_QR kapalı).");

  // Kartlar, uygulamanın imzalarken kullandığı fiyatla (taban × 1.5 + 2 gwei) fonlanır.
  const fees = await getFees();
  const gasPrice = process.env.GAS_PRICE_GWEI ? ethers.parseUnits(process.env.GAS_PRICE_GWEI, "gwei") : fees.maxFeePerGas;
  const perBurner = (gasPrice * (VOTE_GAS_LIMIT + reactions * REACT_GAS_LIMIT) * 11n) / 10n;
  const funding = perBurner * BigInt(burners.length);
  // registerVoters'ın kendi gas'ı: kart başı ~90k (2 SSTORE + yeni hesaba MON gönderme), 2× fiyatla tavan
  const regGas = (fees.base * 2n + fees.maxPriorityFeePerGas) * 90_000n * BigInt(burners.length);
  const total = funding + regGas;
  const balance = await ethers.provider.getBalance(organizer.address);

  console.log(`QR sayısı: ${burners.length}  (seyirci ${audience}, takım ${burners.length - audience})`);
  console.log(`Taban ücret: ${ethers.formatUnits(fees.base, "gwei")} gwei · imza fiyatı: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Kişi başı yükleme: ${ethers.formatEther(perBurner)} MON (1 oy × ${VOTE_GAS_LIMIT} gas + ${reactions} tepki × ${REACT_GAS_LIMIT} gas)`);
  console.log(`Kartlara giden: ${ethers.formatEther(funding)} MON + kayıt gas'ı ≤ ${ethers.formatEther(regGas)} MON`);
  console.log(`Toplam ≤ ${ethers.formatEther(total)} MON   Bakiyen: ${ethers.formatEther(balance)} MON`);
  if (balance - total < RESERVE_MON) {
    console.log(
      `Not: işlem sonrası bakiye 10 MON rezervin altına iniyor. Monad bunu yalnızca "emptying" işlemine izin verir\n` +
        `      (son 3 blokta başka tx yoksa), bu yüzden her fonlama tx'inden önce ${EMPTYING_GAP_MS / 1000} sn bekliyoruz.`
    );
  }
  if (dryRun) return;
  if (balance < total) throw new Error("Bakiye yetmiyor — REACTIONS/AUDIENCE'ı düşür ya da blitz.devnads.com / faucet'ten MON al.");

  // Önce dosyaları yaz: bir tx patlasa bile anahtarlar kaybolmasın.
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csv = ["address,privateKey,teamProjectIdPlusOne,label", ...burners.map((b) => `${b.address},${b.privateKey},${b.teamPlusOne},"${b.label}"`)];
  fs.writeFileSync(path.join(outDir, `voters-${stamp}.csv`), csv.join("\n"));

  const groups = new Map<number, Burner[]>();
  burners.forEach((b) => groups.set(b.teamPlusOne, [...(groups.get(b.teamPlusOne) ?? []), b]));
  for (const [teamPlusOne, list] of groups) {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      await sleep(EMPTYING_GAP_MS); // reserve-balance "emptying" istisnası için: son 3 blokta tx olmasın
      const tx = await bv.registerVoters(
        chunk.map((b) => b.address),
        teamPlusOne,
        { value: perBurner * BigInt(chunk.length) }
      );
      await tx.wait();
      console.log(`Kaydedildi + fonlandı: ${chunk.length} cüzdan (takım ${teamPlusOne || "-"}) tx ${tx.hash}`);
    }
  }

  const cards = await Promise.all(
    burners.map(async (b, i) => {
      const url = `${appUrl}/#/v/${b.privateKey}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" });
      const team = b.teamPlusOne > 0;
      return `<div class="card${team ? " team" : ""}">
  <div class="top"><span class="brand">BlitzVote</span><span class="n">#${i + 1}</span></div>
  <img src="${qr}" alt="QR" />
  <div class="label">${escapeHtml(b.label)}</div>
  <div class="hint">${team ? "Kendi projene oy veremezsin" : "Okut · Bir oy · Sınırsız alkış"}</div>
  <div class="addr">${b.address.slice(0, 6)}…${b.address.slice(-4)}</div>
</div>`;
    })
  );
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>BlitzVote QR kartları</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: system-ui, sans-serif; margin: 0; color: #120b2e; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .card { border: 1.5px dashed #b9aef7; border-radius: 4mm; padding: 4mm; text-align: center; break-inside: avoid; }
  .card.team { border-color: #120b2e; background: #f3f0ff; }
  .top { display: flex; justify-content: space-between; font-size: 10pt; }
  .brand { font-weight: 800; letter-spacing: .02em; color: #6e54f7; }
  .n { color: #888; }
  img { width: 100%; max-width: 48mm; margin: 2mm auto; display: block; }
  .label { font-weight: 700; font-size: 10pt; }
  .hint { font-size: 8.5pt; color: #555; margin-top: 1mm; }
  .addr { font-family: ui-monospace, monospace; font-size: 7.5pt; color: #999; margin-top: 1mm; }
</style></head><body><div class="grid">${cards.join("\n")}</div></body></html>`;
  const htmlPath = path.join(outDir, `qr-${stamp}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`\nQR kartları: ${htmlPath}  (tarayıcıda aç → Yazdır)`);
  console.log(`Anahtarlar: out/voters-${stamp}.csv  — bu klasör .gitignore'da, commit etme.`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
