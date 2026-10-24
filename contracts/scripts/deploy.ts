import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { APP_DEPLOYMENT, DEPLOY_DIR, deploymentFile } from "./lib";
import { SOLO_POOL } from "./words";

async function main() {
  const eventName = process.env.EVENT_NAME || "Monad Blitz Ankara";
  const [deployer] = await ethers.getSigners();
  console.log(`Ağ: ${network.name}  Deployer: ${deployer.address}`);
  console.log(`Bakiye: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MON`);

  const bv = await ethers.deployContract("BlitzType", [eventName, SOLO_POOL]);
  await bv.waitForDeployment();
  const address = await bv.getAddress();
  const receipt = await bv.deploymentTransaction()!.wait();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const rpcUrl = (network.config as { url?: string }).url ?? "http://127.0.0.1:8545";
  const info = { address, chainId, rpcUrl, deployBlock: receipt!.blockNumber, eventName };
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  fs.writeFileSync(deploymentFile(), JSON.stringify(info, null, 2));
  fs.mkdirSync(path.dirname(APP_DEPLOYMENT), { recursive: true });
  fs.writeFileSync(APP_DEPLOYMENT, JSON.stringify(info, null, 2));

  console.log(`\nBlitzType deploy edildi: ${address}`);
  console.log(`Blok: ${receipt!.blockNumber}`);
  console.log(`app/src/deployment.json güncellendi — frontend bu adresi kullanacak.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
