import fs from "fs";
import hre from "hardhat";
import { deploymentFile } from "./lib";
import { SOLO_POOL } from "./words";

// Deploy edilen kontratı MonadVision (Sourcify) ve — ETHERSCAN_API_KEY varsa — Monadscan'de doğrular.
async function main() {
  const info = JSON.parse(fs.readFileSync(deploymentFile(), "utf8"));
  console.log(`Doğrulanıyor: ${info.address} ("${info.eventName}")`);
  try {
    await hre.run("verify:verify", { address: info.address, constructorArguments: [info.eventName, SOLO_POOL] });
  } catch (e) {
    // Monad dokümanı: komut başarılı olsa bile hata basabilir — explorer'dan kontrol et
    console.log(`Uyarı: ${(e as Error).message.split("\n")[0]}`);
  }
  console.log(`Kontrol: https://testnet.monadvision.com/address/${info.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
