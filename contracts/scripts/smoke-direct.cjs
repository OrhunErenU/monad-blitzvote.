// Real-chain smoke test of solo mode from the deployer wallet (plain ethers).
const { ethers } = require("ethers");
require("ts-node/register/transpile-only");
const { SOLO_POOL } = require("./words.ts");
const info = require("../deployments/monadTestnet.json");
const art = require("../artifacts/contracts/BlitzType.sol/BlitzType.json");

async function main() {
  const provider = new ethers.JsonRpcProvider(info.rpcUrl, 10143, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const bt = new ethers.Contract(info.address, art.abi, wallet);
  const pad = (g) => (g * 13n) / 10n;
  console.log("poolSize", await bt.poolSize(), "local", SOLO_POOL.length, "hash0 ok", (await bt.poolHash(0)) === ethers.keccak256(ethers.toUtf8Bytes(SOLO_POOL[0])).slice(0, 18));
  if (!(await bt.nameOf(wallet.address))) {
    const g = await bt.setName.estimateGas(process.env.NAME || "demo");
    const r = await (await bt.setName(process.env.NAME || "demo", { gasLimit: pad(g) })).wait();
    console.log("setName gas", r.gasUsed, "est", g);
  }
  const gs = await bt.startSolo.estimateGas();
  const t0 = Date.now();
  const rs = await (await bt.startSolo({ gasLimit: pad(gs) })).wait();
  const [seed, start] = await bt.soloState(wallet.address);
  const n = BigInt(SOLO_POOL.length);
  const words = Array.from({ length: 15 }, (_, i) =>
    SOLO_POOL[Number(BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [seed, i]))) % n)]
  );
  console.log("startSolo gas", rs.gasUsed, "est", gs, "block", start, "words", words.join(" "));
  for (let i = 0; i < 15; i++) {
    const g = await bt.typeSolo.estimateGas(words[i]);
    const r = await (await bt.typeSolo(words[i], { gasLimit: pad(g) })).wait();
    if (i === 0 || i === 14) console.log(`word ${i} gas used ${r.gasUsed} est ${g} block ${r.blockNumber}`);
  }
  console.log("elapsed", (Date.now() - t0) / 1000, "s");
  console.log("soloState", (await bt.soloState(wallet.address)).map(String));
  console.log("soloTop", (await bt.soloTop()).map((x) => x.map(String)));
  console.log("balance", ethers.formatEther(await provider.getBalance(wallet.address)));
}
main().catch((e) => {
  console.error(e.shortMessage || e);
  process.exitCode = 1;
});
