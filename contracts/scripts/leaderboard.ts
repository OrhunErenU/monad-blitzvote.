import { getContract } from "./lib";

async function main() {
  const bt = await getContract();
  const id = process.env.ROUND ? BigInt(process.env.ROUND) : await bt.currentRound();
  if (id === 0n) return console.log("Henüz tur yok.");
  const [, startBlock, endBlock, wordCount, finishers] = await bt.getRound(id);
  console.log(`Tur #${id} · ${wordCount} kelime · blok ${startBlock}-${endBlock} · bitiren ${finishers}`);
  const [players, names] = await bt.podium(id, 20);
  players.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${names[i] || p.slice(0, 10)}`));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
