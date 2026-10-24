import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

export const DEPLOY_DIR = path.join(__dirname, "..", "deployments");
export const APP_DEPLOYMENT = path.join(__dirname, "..", "..", "app", "src", "deployment.json");

export function deploymentFile() {
  return path.join(DEPLOY_DIR, `${network.name}.json`);
}

export async function getContract() {
  const fromEnv = process.env.BLITZVOTE_ADDRESS;
  let address = fromEnv;
  if (!address && fs.existsSync(deploymentFile())) {
    address = JSON.parse(fs.readFileSync(deploymentFile(), "utf8")).address;
  }
  if (!address) throw new Error("BlitzVote adresi yok: önce deploy et ya da BLITZVOTE_ADDRESS ver.");
  return ethers.getContractAt("BlitzVote", address);
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`${name} env değişkeni gerekli`);
  return v;
}

// Monad gas'ı kullanılan değil LİMİT üzerinden ücretlendirir (docs.monad.xyz/developer-essentials/gas-pricing).
// Uygulama limiti "estimateGas × 1.3" olarak koyar; fonlama da aynı beklenen limitlerle hesaplanır.
// Monad MIP-8 fiyatlarıyla beklenen: oy ~95–130k, tepki ~40k gas. `npm run rehearse` gerçek değeri ölçer.
export const VOTE_GAS_LIMIT = BigInt(process.env.VOTE_GAS ?? 175_000);
export const REACT_GAS_LIMIT = BigInt(process.env.REACT_GAS ?? 55_000);

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
