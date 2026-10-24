import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { getContract, getFees, REACT_GAS_LIMIT, VOTE_GAS_LIMIT } from "./lib";

/**
 * Prova / sahne anı: out/ altındaki en son voters CSV'sindeki burner'larla aynı anda oy + tepki yağdırır.
 * Projektör ekranının canlı sayacını doldurmak ve "aynı saniyede N tx" anını göstermek için.
 *
 * Env: REACTIONS=5 (cüzdan başı tepki), VOTE=1 (oy da versin mi), CSV=yol (opsiyonel)
 */
async function main() {
  const outDir = path.join(__dirname, "..", "out");
  const csvPath =
    process.env.CSV ||
    path.join(
      outDir,
      fs.readdirSync(outDir).filter((f) => f.startsWith("voters-") && f.endsWith(".csv")).sort().pop()!
    );
  const rows = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const reactions = Number(process.env.REACTIONS ?? 5);
  const doVote = process.env.VOTE !== "0";

  const bv = await getContract();
  const n = Number(await bv.projectCount());
  const phase = Number(await bv.phase());
  const wallets = rows.map(([, pk, team]) => ({ w: new ethers.Wallet(pk, ethers.provider), team: Number(team) }));
  console.log(`${wallets.length} cüzdan, proje sayısı ${n}, faz ${phase}`);

  // Monad limit üzerinden ücret alır: limitleri gerçek tahminden (+30%) türet, fonlanan bütçeyi aşma
  const fees = await getFees();
  const pad = (g: bigint, cap: bigint) => ((g * 13n) / 10n > cap ? cap : (g * 13n) / 10n);
  const reactGas = pad(await bv.connect(wallets[0].w).react.estimateGas(0, 0), REACT_GAS_LIMIT);
  let voteGas = VOTE_GAS_LIMIT;
  if (phase === 1) {
    const fresh = [];
    for (const x of wallets) if ((await bv.voteOf(x.w.address)) === 0n) { fresh.push(x); break; }
    if (fresh[0]) {
      const pid = fresh[0].team === 1 && n > 1 ? 1 : 0;
      voteGas = pad(await bv.connect(fresh[0].w).vote.estimateGas(pid), VOTE_GAS_LIMIT);
    }
  }
  console.log(`gas limitleri → oy ${voteGas}, tepki ${reactGas} · fiyat ${ethers.formatUnits(fees.maxFeePerGas, "gwei")} gwei`);
  const txOpts = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };

  const t0 = Date.now();
  const txs = await Promise.allSettled(
    wallets.map(async ({ w, team }) => {
      const c = bv.connect(w);
      let nonce = await ethers.provider.getTransactionCount(w.address, "pending");
      const sent = [];
      if (doVote && phase === 1 && (await bv.voteOf(w.address)) === 0n) {
        let pid = Math.floor(Math.random() * n);
        if (pid + 1 === team) pid = (pid + 1) % n;
        if (n > 1 || pid + 1 !== team) sent.push(await c.vote(pid, { ...txOpts, nonce: nonce++, gasLimit: voteGas }));
      }
      for (let r = 0; r < reactions; r++) {
        sent.push(await c.react(Math.floor(Math.random() * n), Math.floor(Math.random() * 4), { ...txOpts, nonce: nonce++, gasLimit: reactGas }));
      }
      return Promise.all(sent.map((t) => t.wait()));
    })
  );
  const ok = txs.filter((t) => t.status === "fulfilled").length;
  const sentCount = txs.reduce((a, t) => a + (t.status === "fulfilled" ? t.value.length : 0), 0);
  console.log(`${sentCount} tx onaylandı, ${ok}/${wallets.length} cüzdan başarılı, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  txs.filter((t) => t.status === "rejected").slice(0, 3).forEach((t) => console.log("  hata:", (t as PromiseRejectedResult).reason?.shortMessage ?? (t as PromiseRejectedResult).reason));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
