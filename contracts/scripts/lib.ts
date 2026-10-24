import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

export const DEPLOY_DIR = path.join(__dirname, "..", "deployments");
export const APP_DEPLOYMENT = path.join(__dirname, "..", "..", "app", "src", "deployment.json");

export function deploymentFile() {
  return path.join(DEPLOY_DIR, `${network.name}.json`);
}

export async function getContract() {
  let address = process.env.BLITZTYPE_ADDRESS;
  if (!address && fs.existsSync(deploymentFile())) {
    address = JSON.parse(fs.readFileSync(deploymentFile(), "utf8")).address;
  }
  if (!address) throw new Error("BlitzType adresi yok: önce `npm run deploy` ya da BLITZTYPE_ADDRESS ver.");
  return ethers.getContractAt("BlitzType", address);
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`${name} env değişkeni gerekli`);
  return v;
}

// Monad gas'ı kullanılan değil LİMİT üzerinden ücretlendirir (docs.monad.xyz/developer-essentials/gas-pricing).
// Uygulama limiti "estimateGas × 1.3" olarak koyar; fonlama da aynı beklenen limitlerle hesaplanır.
// Yerel ölçüm: kelime ~36k (ilk kelime ~53k, bitiren kelime ~83k), isim ~50k.
// Monad'da soğuk erişimler daha pahalı → beklenen limitler aşağıda. `npm run rehearse` gerçek değeri ölçer.
export const WORD_GAS_LIMIT = BigInt(process.env.WORD_GAS ?? 65_000);
export const NAME_GAS_LIMIT = BigInt(process.env.NAME_GAS ?? 90_000);
export const FINISH_GAS_LIMIT = BigInt(process.env.FINISH_GAS ?? 130_000);

// Monad: hesaplar 10 MON "reserve balance" altına value göndererek inemez — tek istisna "emptying"
// işlemi: gönderen son 3 blokta başka tx atmamışsa. Fonlama tx'leri arasında bu yüzden bekliyoruz.
export const RESERVE_MON = 10n * 10n ** 18n;
export const EMPTYING_GAP_MS = 2500;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Taban ücret × 1.5 + 2 gwei bahşiş — frontend ile aynı formül, kartlar buna göre fonlanır. */
export async function getFees() {
  const block = await ethers.provider.getBlock("latest");
  const base = block?.baseFeePerGas ?? ethers.parseUnits("100", "gwei");
  const tip = ethers.parseUnits("2", "gwei");
  return { base, maxFeePerGas: (base * 15n) / 10n + tip, maxPriorityFeePerGas: tip };
}

/** Son ~50 bloğun ortalama süresi (ms). Monad ~300-400 ms. */
export async function blockTimeMs() {
  const head = await ethers.provider.getBlock("latest");
  const old = await ethers.provider.getBlock(Math.max(0, head!.number - 50));
  const dt = (head!.timestamp - old!.timestamp) * 1000;
  const n = head!.number - old!.number;
  const ms = n > 0 ? dt / n : 400;
  return ms > 50 && ms < 15_000 ? ms : 400;
}
