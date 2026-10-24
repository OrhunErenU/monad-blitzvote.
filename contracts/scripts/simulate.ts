import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { blockTimeMs, getContract, getFees, sleep, WORD_GAS_LIMIT, FINISH_GAS_LIMIT, NAME_GAS_LIMIT } from "./lib";

/**
 * Bot yarışçılar: out/ altındaki en son players CSV'sindeki kartlarla mevcut turu "insan hızında" yazar.
 * Prova ve sahne anı için. Env: BOTS=20 (kaç kart), WPS_MIN=1 WPS_MAX=3 (kelime/sn), CSV=yol
 */
async function main() {
  const outDir = path.join(__dirname, "..", "out");
  const csvPath =
    process.env.CSV ||
    path.join(outDir, fs.readdirSync(outDir).filter((f) => f.startsWith("players-") && f.endsWith(".csv")).sort().pop()!);
  const keys = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")[1]);
  const bots = keys.slice(0, Number(process.env.BOTS ?? keys.length)).map((k) => new ethers.Wallet(k, ethers.provider));
  const wpsMin = Number(process.env.WPS_MIN ?? 1);
  const wpsMax = Number(process.env.WPS_MAX ?? 3);

  const bt = await getContract();
  const id = await bt.currentRound();
  if (id === 0n) throw new Error("Önce `npm run round` ile tur başlat.");
  const [startedAt, startBlock, endBlock] = await bt.getRound(id);
  const logs = await bt.queryFilter(bt.filters.RoundStarted(id), Number(startedAt), Number(startedAt));
  const words: string[] = [...(logs[0] as any).args.words];
  console.log(`Tur #${id}: ${words.length} kelime, blok ${startBlock}-${endBlock}, ${bots.length} bot`);

  const fees = await getFees();
  const opts = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };

  // RPC'yi yormamak için blok numarasını kelime başı sormuyoruz: başlangıç/bitişi saate çeviriyoruz
  const ms = await blockTimeMs();
  const head = await ethers.provider.getBlockNumber();
  const startAt = Date.now() + Math.max(0, Number(startBlock) - head) * ms;
  const endAt = Date.now() + (Number(endBlock) - head) * ms;

  const t0 = Date.now();
  let sent = 0;
  const results = await Promise.allSettled(
    bots.map(async (w, bi) => {
      const c = bt.connect(w);
      let nonce = await ethers.provider.getTransactionCount(w.address, "pending");
      if ((await bt.nameOf(w.address)) === "") {
        await c.setName(`bot-${String(bi + 1).padStart(2, "0")}`, { ...opts, nonce: nonce++, gasLimit: NAME_GAS_LIMIT });
      }
      await sleep(Math.max(0, startAt - Date.now()) + 200);
      let done = Number(await bt.progressOf(w.address, id));
      const wps = wpsMin + Math.random() * (wpsMax - wpsMin);
      const pending = [];
      for (; done < words.length; done++) {
        await sleep((1000 / wps) * (0.6 + Math.random() * 0.8));
        if (Date.now() > endAt) break;
        const last = done === words.length - 1;
        pending.push(await c.typeWord(words[done], { ...opts, nonce: nonce++, gasLimit: last ? FINISH_GAS_LIMIT : WORD_GAS_LIMIT }));
        sent++;
      }
      await Promise.all(pending.map((t) => t.wait()));
    })
  );
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  console.log(`${sent} kelime işlemi, ${((Date.now() - t0) / 1000).toFixed(1)} sn, ${bots.length - failed.length}/${bots.length} bot sorunsuz`);
  failed.slice(0, 3).forEach((f) => console.log("  hata:", f.reason?.shortMessage ?? f.reason));
  console.log(`Bitiren: ${await bt.finisherCount(id)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
