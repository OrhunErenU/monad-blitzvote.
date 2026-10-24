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

// Monad gas'ı kullanılan değil LİMİT üzerinden ücretlendirir; bu limitler hem fonlama hesabında
// hem simülasyonda tavan olarak kullanılır. (Yerel test: oy ~99k, tepki ~30k gas.)
export const VOTE_GAS_LIMIT = 250_000n;
export const REACT_GAS_LIMIT = 80_000n;
