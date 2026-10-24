// Deploy with plain ethers (no Hardhat network layer) — useful behind an HTTPS proxy:
//   NODE_USE_ENV_PROXY=1 PRIVATE_KEY=0x… node scripts/deploy-direct.cjs
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("ts-node/register/transpile-only");
const { SOLO_POOL } = require("./words.ts");

async function main() {
  const rpcUrl = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
  const eventName = process.env.EVENT_NAME || "Monad Blitz Ankara";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 10143, { staticNetwork: true });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const art = require("../artifacts/contracts/BlitzType.sol/BlitzType.json");
  console.log(`Deployer ${wallet.address}  balance ${ethers.formatEther(await provider.getBalance(wallet.address))} MON`);
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const tx = await factory.getDeployTransaction(eventName, SOLO_POOL);
  const est = await provider.estimateGas({ ...tx, from: wallet.address });
  console.log(`estimated gas ${est}`);
  const sent = await wallet.sendTransaction({ ...tx, gasLimit: (est * 12n) / 10n });
  console.log(`tx ${sent.hash}`);
  const r = await sent.wait();
  const info = { address: r.contractAddress, chainId: 10143, rpcUrl, deployBlock: r.blockNumber, eventName };
  fs.mkdirSync(path.join(__dirname, "../deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../deployments/monadTestnet.json"), JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(__dirname, "../../app/src/deployment.json"), JSON.stringify(info, null, 2) + "\n");
  console.log(`BlitzType ${r.contractAddress} at block ${r.blockNumber}, gas used ${r.gasUsed}, status ${r.status}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
