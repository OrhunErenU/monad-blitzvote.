import { ethers } from "hardhat";
import { blockTimeMs, getContract } from "./lib";
import { pickWords } from "./words";

/**
 * Yeni tur: WORDS=15 ROUND_SECONDS=45 COUNTDOWN=5   ·   END=1 → mevcut turu hemen bitir
 * Süreler blok sayısına, ağın son 50 bloktaki ortalama blok süresiyle çevrilir.
 */
async function main() {
  const bt = await getContract();
  if (process.env.END === "1") {
    await (await bt.endRound()).wait();
    console.log("Tur bitirildi.");
    return;
  }
  const n = Number(process.env.WORDS ?? 15);
  const seconds = Number(process.env.ROUND_SECONDS ?? 45);
  const countdown = Number(process.env.COUNTDOWN ?? 5);
  const ms = await blockTimeMs();
  const delayBlocks = BigInt(Math.max(1, Math.round((countdown * 1000) / ms)));
  const durationBlocks = BigInt(Math.max(1, Math.round((seconds * 1000) / ms)));
  const words = pickWords(n);

  const tx = await bt.startRound(words, delayBlocks, durationBlocks);
  const r = await tx.wait();
  const id = await bt.currentRound();
  const [startedAt, startBlock, endBlock] = await bt.getRound(id);
  console.log(`Tur #${id} başladı (tx ${tx.hash}, blok ${r!.blockNumber})`);
  console.log(`Blok süresi ~${Math.round(ms)} ms → geri sayım ${delayBlocks} blok, süre ${durationBlocks} blok`);
  console.log(`Yazma açık: blok ${startBlock} – ${endBlock}  (startedAt ${startedAt})`);
  console.log(`Kelimeler: ${words.join(" ")}`);
  void ethers;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
