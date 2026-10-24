import fs from "fs";
import path from "path";
import { getContract } from "./lib";

// projects.json: [{ "name": "Proje adı", "team": "Takım adı", "members": 3 }, ...]
async function main() {
  const file = process.env.PROJECTS_FILE || path.join(__dirname, "..", "projects.json");
  const projects: { name: string; team: string }[] = JSON.parse(fs.readFileSync(file, "utf8"));
  const bv = await getContract();
  const existing = Number(await bv.projectCount());
  const toAdd = projects.slice(existing);
  if (toAdd.length === 0) {
    console.log(`Zincirde zaten ${existing} proje var, eklenecek yeni proje yok.`);
    return;
  }
  // chunk to keep each tx small
  for (let i = 0; i < toAdd.length; i += 15) {
    const chunk = toAdd.slice(i, i + 15);
    const tx = await bv.addProjects(
      chunk.map((p) => p.name),
      chunk.map((p) => p.team)
    );
    await tx.wait();
    console.log(`+${chunk.length} proje eklendi (tx ${tx.hash})`);
  }
  const all = await bv.getProjects();
  all.forEach((p, i) => console.log(`  #${i}  ${p.name}  —  ${p.team}`));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
