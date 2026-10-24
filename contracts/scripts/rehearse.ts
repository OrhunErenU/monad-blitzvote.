import { ethers, network } from "hardhat";
import { EMPTYING_GAP_MS, getFees, sleep } from "./lib";

/**
 * Gerçek ağda ~1 dakikalık prova — asıl kontrata ve deployment dosyalarına dokunmaz.
 * Atılabilir bir BlitzType deploy eder, 1 burner'ı fonlar, isim + 3 kelimelik tur oynar ve ölçer:
 *   gerçek gas (→ WORD_GAS / NAME_GAS / FINISH_GAS), eth_sendRawTransactionSync desteği ve gecikme.
 * Sonunda burner'da kalan MON organizatöre geri döner.
 */
type RawReceipt = { gasUsed: string; blockNumber: string; status: string; transactionHash: string };

async function waitTx(hash: string) {
  for (;;) {
    const r = await ethers.provider.getTransactionReceipt(hash);
    if (r) return r;
    await sleep(150);
  }
}

async function main() {
  const [org] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Ağ: ${network.name} (chain ${chainId})  Organizatör: ${org.address}`);
  console.log(`Bakiye: ${ethers.formatEther(await ethers.provider.getBalance(org.address))} MON\n`);

  const bt = await ethers.deployContract("BlitzType", ["BlitzType rehearsal"]);
  await bt.waitForDeployment();
  const addr = await bt.getAddress();
  console.log(`1/5 prova kontratı: ${addr}`);

  const burner = ethers.Wallet.createRandom().connect(ethers.provider);
  await sleep(EMPTYING_GAP_MS);
  await (await bt.fund([burner.address], { value: ethers.parseEther("0.15") })).wait();
  console.log(`2/5 burner fonlandı (0.15 MON): ${burner.address}`);

  const words = ["monad", "blok", "hizli"];
  await (await bt.startRound(words, 1, 500)).wait();
  console.log("3/5 3 kelimelik tur başladı");

  const fees = await getFees();
  const base = { chainId, type: 2, to: addr, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0n };
  let nonce = await ethers.provider.getTransactionCount(burner.address, "pending");
  let sync = true;

  async function send(data: string, gasLimit: bigint): Promise<{ r: RawReceipt; secs: number }> {
    const raw = await burner.signTransaction({ ...base, nonce: nonce++, gasLimit, data });
    const t0 = Date.now();
    if (sync) {
      try {
        const r: RawReceipt = await ethers.provider.send("eth_sendRawTransactionSync", [raw]);
        return { r, secs: (Date.now() - t0) / 1000 };
      } catch (e) {
        sync = false;
        console.log(`   eth_sendRawTransactionSync yok (${(e as Error).message.split("\n")[0].slice(0, 70)}) → polling`);
      }
    }
    const hash = await ethers.provider.send("eth_sendRawTransaction", [raw]);
    const rc = await waitTx(hash);
    return {
      r: { gasUsed: "0x" + rc.gasUsed.toString(16), blockNumber: "0x" + rc.blockNumber.toString(16), status: rc.status ? "0x1" : "0x0", transactionHash: hash },
      secs: (Date.now() - t0) / 1000,
    };
  }

  const c = bt.connect(burner);
  const nameEst = await c.setName.estimateGas("prova");
  const name = await send(bt.interface.encodeFunctionData("setName", ["prova"]), (nameEst * 13n) / 10n);
  const gas: bigint[] = [];
  const secs: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const est = await c.typeWord.estimateGas(words[i]);
    const { r, secs: s } = await send(bt.interface.encodeFunctionData("typeWord", [words[i]]), (est * 13n) / 10n);
    if (r.status !== "0x1") throw new Error(`kelime ${i} revert oldu`);
    gas.push(BigInt(r.gasUsed));
    secs.push(s);
  }
  console.log(`4/5 isim + 3 kelime zincirde (gecikmeler: ${secs.map((s) => s.toFixed(2)).join(" / ")} sn)`);
  const spent = ethers.parseEther("0.15") - (await ethers.provider.getBalance(burner.address));

  await sleep(EMPTYING_GAP_MS);
  const left = await ethers.provider.getBalance(burner.address);
  const sweepFee = 21_000n * fees.maxFeePerGas;
  if (left > sweepFee) {
    await (await burner.sendTransaction({ to: org.address, value: left - sweepFee, gasLimit: 21_000n, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas })).wait();
  }
  console.log("5/5 kalan MON organizatöre döndü");

  const round = (g: bigint) => (((g * 13n) / 10n) / 1000n + 1n) * 1000n;
  const word = gas[1] > gas[0] ? gas[1] : gas[0];
  console.log(`
──────── sonuç ────────
taban ücret       ${ethers.formatUnits(fees.base, "gwei")} gwei
isim gasUsed      ${BigInt(name.r.gasUsed)}
kelime gasUsed    ilk ${gas[0]} · ara ${gas[1]} · bitiren ${gas[2]}
harcanan          ${ethers.formatEther(spent)} MON (isim + 3 kelime; Monad limit üzerinden ücretlendirir)
sync onay         ${sync ? "VAR ✓" : "yok — uygulama otomatik polling'e düşer"}
ortalama gecikme  ${(secs.reduce((a, b) => a + b, 0) / secs.length).toFixed(2)} sn / kelime

.env için öneri:
WORD_GAS=${round(word)}
NAME_GAS=${round(BigInt(name.r.gasUsed))}
FINISH_GAS=${round(gas[2])}
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
