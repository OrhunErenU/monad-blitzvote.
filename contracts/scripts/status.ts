import { getContract } from "./lib";

const PHASES = ["Setup", "Open", "Closed"];

async function main() {
  const bv = await getContract();
  const [phase, voterCount, total, projects, votes] = await bv.snapshot();
  console.log(`Faz: ${PHASES[Number(phase)]}  Kayıtlı seçmen: ${voterCount}  Kullanılan oy: ${total}`);
  projects
    .map((p, i) => ({ i, name: p.name, team: p.team, v: votes[i] }))
    .sort((a, b) => Number(b.v - a.v))
    .forEach((p) => console.log(`  ${String(p.v).padStart(4)}  #${p.i} ${p.name} (${p.team})`));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
