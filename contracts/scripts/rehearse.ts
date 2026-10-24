import { ethers, network } from "hardhat";
import { EMPTYING_GAP_MS, getFees, sleep } from "./lib";

/**
 * Gerçek ağda 1 dakikalık prova — asıl kontrata ve deployment dosyalarına dokunmaz.
 * Atılabilir bir BlitzVote deploy eder, 1 burner'ı fonlar, oy + tepki atar ve şunları ölçer:
 *   - oy / tepki için gerçek gasUsed (→ VOTE_GAS / REACT_GAS önerisi)
 *   - eth_sendRawTransactionSync destekleniyor mu, oy kaç saniyede onaylanıyor
 *   - kart başı gerçek maliyet
 * Sonunda burner'da kalan MON organizatöre geri gönderilir.
 */
async function waitTx(hash: string) {
  for (;;) {
    const r = await ethers.provider.getTransactionReceipt(hash);
    if (r) return r;
    await sleep(200);
  }
}

async function main() {
  const [org] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Ağ: ${network.name} (chain ${chainId})  Organizatör: ${org.address}`);
  console.log(`Bakiye: ${ethers.formatEther(await ethers.provider.getBalance(org.address))} MON\n`);

  const bv = await ethers.deployContract("BlitzVote", ["BlitzVote rehearsal"]);
  await bv.waitForDeployment();
  const addr = await bv.getAddress();
  console.log(`1/6 prova kontratı: ${addr}`);

  await (await bv.addProjects(["Alpha", "Beta"], ["Team A", "Team B"])).wait();
  console.log("2/6 2 proje eklendi");

  const burner = ethers.Wallet.createRandom().connect(ethers.provider);
  await sleep(EMPTYING_GAP_MS);
  await (await bv.registerVoters([burner.address], 0, { value: ethers.parseEther("0.15") })).wait();
  console.log(`3/6 burner kaydedildi + 0.15 MON: ${burner.address}`);

  await (await bv.openVoting()).wait();
  console.log("4/6 oylama açıldı");

  const fees = await getFees();
  const c = bv.connect(burner);
  const voteEst = await c.vote.estimateGas(1);
  const reactEst = await c.react.estimateGas(0, 1);
  const voteLimit = (voteEst * 13n) / 10n;
  const reactLimit = (reactEst * 13n) / 10n;

  // --- vote via eth_sendRawTransactionSync (falls back if the RPC doesn't support it)
  let nonce = await ethers.provider.getTransactionCount(burner.address, "pending");
  const base = { chainId, type: 2, to: addr, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0n };
  const rawVote = await burner.signTransaction({ ...base, nonce: nonce++, gasLimit: voteLimit, data: bv.interface.encodeFunctionData("vote", [1]) });
  const t0 = Date.now();
  let voteRcpt: { gasUsed: string; blockNumber: string; status: string; transactionHash: string } | null = null;
  let sync = true;
  try {
    voteRcpt = await ethers.provider.send("eth_sendRawTransactionSync", [rawVote]);
  } catch (e) {
    sync = false;
    console.log(`   eth_sendRawTransactionSync kullanılamadı (${(e as Error).message.split("\n")[0].slice(0, 80)}) → normal gönderim`);
    const hash = await ethers.provider.send("eth_sendRawTransaction", [rawVote]);
    const r = await waitTx(hash);
    voteRcpt = { gasUsed: "0x" + r!.gasUsed.toString(16), blockNumber: "0x" + r!.blockNumber.toString(16), status: r!.status ? "0x1" : "0x0", transactionHash: hash };
  }
  const voteSecs = ((Date.now() - t0) / 1000).toFixed(2);
  if (voteRcpt!.status !== "0x1") throw new Error("Oy işlemi revert oldu");
  console.log(`5/6 oy ${voteSecs} sn'de blokta (${sync ? "eth_sendRawTransactionSync" : "receipt polling"}), blok ${BigInt(voteRcpt!.blockNumber)}`);

  // --- 3 reactions back-to-back
  const t1 = Date.now();
  const hashes: string[] = [];
  for (let i = 0; i < 3; i++) {
    const raw = await burner.signTransaction({ ...base, nonce: nonce++, gasLimit: reactLimit, data: bv.interface.encodeFunctionData("react", [0, i]) });
    hashes.push(await ethers.provider.send("eth_sendRawTransaction", [raw]));
  }
  const reactRcpts = await Promise.all(hashes.map((h) => waitTx(h)));
  console.log(`6/6 3 tepki ${((Date.now() - t1) / 1000).toFixed(2)} sn'de onaylandı (bloklar ${[...new Set(reactRcpts.map((r) => r!.blockNumber))].join(", ")})`);

  const voteUsed = BigInt(voteRcpt!.gasUsed);
  const reactUsed = reactRcpts[0]!.gasUsed;
  const spent = ethers.parseEther("0.15") - (await ethers.provider.getBalance(burner.address));

  // --- sweep leftovers back (an "emptying" tx: wait > 3 blocks since the burner's last tx)
  await sleep(EMPTYING_GAP_MS);
  const left = await ethers.provider.getBalance(burner.address);
  const sweepFee = 21_000n * fees.maxFeePerGas;
  if (left > sweepFee) {
    await (await burner.sendTransaction({ to: org.address, value: left - sweepFee, gasLimit: 21_000n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas })).wait();
  }

  const recVote = ((voteUsed * 13n) / 10n / 1000n + 1n) * 1000n;
  const recReact = ((reactUsed * 13n) / 10n / 1000n + 1n) * 1000n;
  console.log(`
──────── sonuç ────────
taban ücret        ${ethers.formatUnits(fees.base, "gwei")} gwei
oy gasUsed         ${voteUsed}   (tahmin ${voteEst}, limit ${voteLimit})
tepki gasUsed      ${reactUsed}   (tahmin ${reactEst}, limit ${reactLimit})
1 oy + 3 tepki     ${ethers.formatEther(spent)} MON harcadı (Monad limit üzerinden ücretlendirir)
sync onay          ${sync ? "VAR ✓" : "yok — uygulama otomatik olarak polling'e düşer"}

.env için öneri:
VOTE_GAS=${recVote}
REACT_GAS=${recReact}
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
