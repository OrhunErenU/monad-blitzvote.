import { getContract } from "./lib";

async function main() {
  // npm run open / npm run close → npm_lifecycle_event; doğrudan çalıştırırken PHASE=open|close
  const phase = process.env.PHASE || process.env.npm_lifecycle_event || "";
  const bv = await getContract();
  const tx = phase === "open" ? await bv.openVoting() : phase === "close" ? await bv.closeVoting() : null;
  if (!tx) throw new Error("PHASE=open ya da PHASE=close olmalı");
  await tx.wait();
  console.log(`Oylama ${phase === "open" ? "AÇILDI" : "KAPANDI"} (tx ${tx.hash})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
