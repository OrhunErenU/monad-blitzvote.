import { expect } from "chai";
import { ethers, network } from "hardhat";
import { SOLO_POOL } from "../scripts/words";

const WORDS = ["monad", "blok", "hizli", "zincir"];


function walkIndex(seed: string, i: number) {
  const n = BigInt(SOLO_POOL.length);
  const x = BigInt(seed);
  return Number((x % n + BigInt(i) * (1n + (x >> 128n) % (n - 1n))) % n);
}

async function mine(n: number) {
  await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
}

describe("BlitzType", () => {
  async function setup(delay = 0, duration = 100) {
    const [org, alice, bob, carol] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["Monad Blitz Ankara", SOLO_POOL]);
    await bt.startRound(WORDS, delay, duration);
    return { bt, org, alice, bob, carol };
  }

  it("only organizer starts rounds and funds", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await expect(bt.connect(alice).startRound(WORDS, 0, 10)).to.be.revertedWithCustomError(bt, "NotOrganizer");
    await expect(bt.connect(alice).fund([alice.address])).to.be.revertedWithCustomError(bt, "NotOrganizer");
  });

  it("rejects typing before any round", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await expect(bt.connect(alice).typeWord("monad")).to.be.revertedWithCustomError(bt, "NotStarted");
  });

  it("enforces the countdown and the end block", async () => {
    const { bt, alice } = await setup(5, 3);
    await expect(bt.connect(alice).typeWord("monad")).to.be.revertedWithCustomError(bt, "NotStarted");
    await mine(4); // next tx lands in startBlock
    await bt.connect(alice).typeWord("monad");
    await mine(5);
    await expect(bt.connect(alice).typeWord("blok")).to.be.revertedWithCustomError(bt, "RoundOver");
  });

  it("words must be correct and in order", async () => {
    const { bt, alice } = await setup();
    await expect(bt.connect(alice).typeWord("blok")).to.be.revertedWithCustomError(bt, "WrongWord");
    await expect(bt.connect(alice).typeWord("Monad")).to.be.revertedWithCustomError(bt, "WrongWord");
    await expect(bt.connect(alice).typeWord("monad")).to.emit(bt, "Typed").withArgs(1, alice.address, 0);
    await expect(bt.connect(alice).typeWord("monad")).to.be.revertedWithCustomError(bt, "WrongWord");
    await bt.connect(alice).typeWord("blok");
    expect(await bt.progressOf(alice.address, 1)).to.equal(2n);
  });

  it("records finish order and blocks taken", async () => {
    const { bt, alice, bob } = await setup();
    for (const w of WORDS.slice(0, 3)) await bt.connect(alice).typeWord(w);
    for (const w of WORDS) await bt.connect(bob).typeWord(w);
    await expect(bt.connect(alice).typeWord("zincir")).to.emit(bt, "Finished");
    expect(await bt.finisherAt(1, 1)).to.equal(bob.address);
    expect(await bt.finisherAt(1, 2)).to.equal(alice.address);
    expect(await bt.finisherCount(1)).to.equal(2n);
    await expect(bt.connect(bob).typeWord("monad")).to.be.revertedWithCustomError(bt, "AlreadyFinished");
  });

  it("names, podium and state view", async () => {
    const { bt, alice, bob } = await setup();
    await expect(bt.connect(alice).setName("")).to.be.revertedWithCustomError(bt, "BadName");
    await expect(bt.connect(alice).setName("x".repeat(17))).to.be.revertedWithCustomError(bt, "BadName");
    await bt.connect(alice).setName("Obu");
    for (const w of WORDS) await bt.connect(alice).typeWord(w);
    const [players, names] = await bt.podium(1, 5);
    expect(players).to.deep.equal([alice.address]);
    expect(names).to.deep.equal(["Obu"]);
    const s = await bt.state(bob.address);
    expect(s.round).to.equal(1n);
    expect(s.wordCount).to.equal(4n);
    expect(s.myProgress).to.equal(0n);
    expect(s.finishers).to.equal(1n);
  });

  it("new round resets progress; cannot start while live; endRound closes early", async () => {
    const { bt, alice } = await setup(0, 1000);
    await bt.connect(alice).typeWord("monad");
    await expect(bt.startRound(["a"], 0, 10)).to.be.revertedWithCustomError(bt, "RoundLive");
    await bt.endRound();
    await bt.startRound(["deniz", "kum"], 0, 50);
    expect(await bt.currentRound()).to.equal(2n);
    expect(await bt.progressOf(alice.address, 2)).to.equal(0n);
    expect(await bt.progressOf(alice.address, 1)).to.equal(1n);
    await bt.connect(alice).typeWord("deniz");
    expect(await bt.progressOf(alice.address, 2)).to.equal(1n);
  });

  it("validates round input", async () => {
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await expect(bt.startRound([], 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(Array(33).fill("a"), 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(["a", ""], 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(["a"], 0, 0)).to.be.revertedWithCustomError(bt, "BadWords");
  });

  it("funds players and refunds dust", async () => {
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    const ws = [1, 2, 3].map(() => ethers.Wallet.createRandom().address);
    await bt.fund(ws, { value: 10n });
    for (const w of ws) expect(await ethers.provider.getBalance(w)).to.equal(3n);
    expect(await ethers.provider.getBalance(await bt.getAddress())).to.equal(0n);
  });

  it("gas per word stays small (Monad charges the limit)", async () => {
    const { bt, alice } = await setup();
    const first = await (await bt.connect(alice).typeWord("monad")).wait();
    const next = await (await bt.connect(alice).typeWord("blok")).wait();
    await bt.connect(alice).typeWord("hizli");
    const fin = await (await bt.connect(alice).typeWord("zincir")).wait();
    console.log(`      gas first word ${first!.gasUsed}, next ${next!.gasUsed}, finishing word ${fin!.gasUsed}`);
    expect(next!.gasUsed).to.be.lessThan(45_000n);
    expect(fin!.gasUsed).to.be.lessThan(100_000n);
  });

  it("50 players race concurrently", async () => {
    const [org] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["burst", SOLO_POOL]);
    const players = Array.from({ length: 50 }, () => ethers.Wallet.createRandom().connect(ethers.provider));
    await bt.fund(players.map((p) => p.address), { value: ethers.parseEther("1") });
    await bt.startRound(WORDS, 0, 1000);
    for (const w of WORDS) await Promise.all(players.map((p) => bt.connect(p).typeWord(w)));
    expect(await bt.finisherCount(1)).to.equal(50n);
    void org;
  });

  // ---------------------------------------------------------------- solo mode
  async function soloWords(bt: any, player: string) {
    const [seed] = await bt.soloState(player);
    const n = BigInt(SOLO_POOL.length);
    const out: string[] = [];
    for (let i = 0; i < 15; i++) {
      const idx = walkIndex(seed, i);
      expect(await bt.soloWordIndex(seed, i)).to.equal(BigInt(idx)); // client derivation == contract
      out.push(SOLO_POOL[idx]);
    }
    return out;
  }

  it("solo: stores the pool and rejects typing without a run", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    expect(await bt.poolSize()).to.equal(BigInt(SOLO_POOL.length));
    expect(await bt.poolHash(0)).to.equal(ethers.keccak256(ethers.toUtf8Bytes(SOLO_POOL[0])).slice(0, 18));
    await expect(bt.connect(alice).typeSolo("monad")).to.be.revertedWithCustomError(bt, "NoSolo");
    await expect(ethers.deployContract("BlitzType", ["x", ["a"]])).to.be.reverted;
  });

  it("solo: verifies words in order, not in the start block, records best and leaderboard", async () => {
    const [, alice, bob] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await bt.connect(alice).setName("alice");

    await network.provider.send("evm_setAutomine", [false]);
    await bt.connect(alice).startSolo();
    const early = await bt.connect(alice).typeSolo("monad", { gasLimit: 200000 });
    await mine(1);
    await network.provider.send("evm_setAutomine", [true]);
    const r = await ethers.provider.getTransactionReceipt(early.hash);
    expect(r!.status).to.equal(0); // same block as startSolo → NotStarted

    const words = await soloWords(bt, alice.address);
    const wrong = SOLO_POOL.find((w) => w !== words[0])!;
    await expect(bt.connect(alice).typeSolo(wrong)).to.be.revertedWithCustomError(bt, "WrongWord");
    for (let i = 0; i < 14; i++) await bt.connect(alice).typeSolo(words[i]);
    await expect(bt.connect(alice).typeSolo(words[14])).to.emit(bt, "SoloFinished");
    await expect(bt.connect(alice).typeSolo(words[0])).to.be.revertedWithCustomError(bt, "AlreadyFinished");
    const [, start, done, runs, best] = await bt.soloState(alice.address);
    expect(done).to.equal(15n);
    expect(runs).to.equal(1n);
    expect(best).to.be.greaterThan(0n);
    void start;

    // bob is faster (mines nothing between words → fewer blocks? use automine off to batch)
    await bt.connect(bob).startSolo();
    const bw = await soloWords(bt, bob.address);
    await network.provider.send("evm_setAutomine", [false]);
    for (let i = 0; i < 15; i++) await bt.connect(bob).typeSolo(bw[i], { gasLimit: 300000 });
    await mine(1);
    await network.provider.send("evm_setAutomine", [true]);
    const [players, bests, names] = await bt.soloTop();
    expect(players).to.deep.equal([bob.address, alice.address]);
    expect(bests[0]).to.equal(1n);
    expect(names[1]).to.equal("alice");

    // a slower second run is not a personal best and doesn't move the board
    await bt.connect(bob).startSolo();
    const bw2 = await soloWords(bt, bob.address);
    for (const w of bw2) await bt.connect(bob).typeSolo(w);
    const [, , , runs2, best2] = await bt.soloState(bob.address);
    expect(runs2).to.equal(2n);
    expect(best2).to.equal(1n);
    expect((await bt.soloTop())[0]).to.deep.equal([bob.address, alice.address]);
  });

  it("solo: leaderboard keeps top 10 sorted with one entry per player", async () => {
    const signers = (await ethers.getSigners()).slice(1, 14);
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    // player k takes roughly k extra blocks
    for (let k = 0; k < signers.length; k++) {
      const p = signers[signers.length - 1 - k]; // slower players first, so inserts land everywhere
      await bt.connect(p).startSolo();
      const w = await soloWords(bt, p.address);
      await mine(signers.length - k);
      for (const x of w) await bt.connect(p).typeSolo(x);
    }
    const [players, bests] = await bt.soloTop();
    expect(players.length).to.equal(10);
    for (let i = 1; i < bests.length; i++) expect(bests[i]).to.be.greaterThanOrEqual(bests[i - 1]);
    expect(new Set(players).size).to.equal(10);
  });

  it("solo: gas per word", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    const start = await (await bt.connect(alice).startSolo()).wait();
    const w = await soloWords(bt, alice.address);
    const g: bigint[] = [];
    for (const x of w) g.push((await (await bt.connect(alice).typeSolo(x)).wait())!.gasUsed);
    console.log(`      startSolo ${start!.gasUsed}, first word ${g[0]}, next ${g[1]}, last ${g[14]}`);
    expect(g[1]).to.be.lessThan(60000n);
  });

  // -------------------------------------------------------------------- rooms
  function roomWords(seed: string, count: number) {
    const n = BigInt(SOLO_POOL.length);
    void n;
    return Array.from({ length: count }, (_, i) => SOLO_POOL[walkIndex(seed, i)]);
  }

  it("rooms: create with a code, join, only host starts, race with ranks", async () => {
    const [, host, bob, carol, dave] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await expect(bt.connect(host).createRoom(2)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.connect(host).createRoom(5)).to.emit(bt, "RoomCreated").withArgs(1001n, host.address, 5n);
    await expect(bt.connect(bob).joinRoom(999)).to.be.revertedWithCustomError(bt, "NoRoom");
    await bt.connect(bob).joinRoom(1001);
    await bt.connect(bob).joinRoom(1001); // idempotent
    await bt.connect(carol).joinRoom(1001);
    await bt.connect(bob).setName("bob");
    let [, , , , wc, players] = await bt.getRoom(1001);
    expect(wc).to.equal(5n);
    expect(players).to.equal(3n);

    await expect(bt.connect(bob).startRoom(1001, 2, 100)).to.be.revertedWithCustomError(bt, "NotHost");
    await expect(bt.connect(bob).typeRoom(1001, "monad")).to.be.revertedWithCustomError(bt, "NotStarted");
    await bt.connect(host).startRoom(1001, 2, 100);
    await expect(bt.connect(dave).joinRoom(1001)).to.be.revertedWithCustomError(bt, "RoomStarted");
    await expect(bt.connect(host).startRoom(1001, 2, 100)).to.be.revertedWithCustomError(bt, "RoomStarted");
    const [, seed] = await bt.getRoom(1001);
    const w = roomWords(seed, 5);
    await expect(bt.connect(dave).typeRoom(1001, w[0])).to.be.revertedWithCustomError(bt, "NotJoined");
    await mine(1);
    for (const x of w) await bt.connect(bob).typeRoom(1001, x);
    await expect(bt.connect(carol).typeRoom(1001, SOLO_POOL.find((y) => y !== w[0])!)).to.be.revertedWithCustomError(bt, "WrongWord");
    for (const x of w.slice(0, 3)) await bt.connect(carol).typeRoom(1001, x);
    for (const x of w) await bt.connect(host).typeRoom(1001, x);
    await expect(bt.connect(bob).typeRoom(1001, w[0])).to.be.revertedWithCustomError(bt, "AlreadyFinished");

    const [addrs, names, done, rank, blocks] = await bt.roomBoard(1001);
    expect(addrs).to.deep.equal([host.address, bob.address, carol.address]);
    expect(names[1]).to.equal("bob");
    expect(done.map(Number)).to.deep.equal([5, 5, 3]);
    expect(rank.map(Number)).to.deep.equal([2, 1, 0]);
    expect(await bt.roomWins(bob.address)).to.equal(1n);
    expect(await bt.roomWins(host.address)).to.equal(0n);
    expect(new Set(w).size).to.equal(w.length);
    expect(blocks[1]).to.be.greaterThan(0n);

    // a second room gets the next code and is independent
    await bt.connect(carol).createRoom(10);
    expect(await bt.lastRoom()).to.equal(1002n);
    [, , , , wc, players] = await bt.getRoom(1002);
    expect(players).to.equal(1n);
  });

  it("rooms: typing closes at the end block", async () => {
    const [, host] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    await bt.connect(host).createRoom(3);
    await bt.connect(host).startRoom(1001, 1, 3);
    const [, seed] = await bt.getRoom(1001);
    await mine(5);
    await expect(bt.connect(host).typeRoom(1001, roomWords(seed, 1)[0])).to.be.revertedWithCustomError(bt, "RoundOver");
  });

  it("solo: keeps the history of every finished run", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x", SOLO_POOL]);
    for (let r = 0; r < 2; r++) {
      await bt.connect(alice).startSolo();
      const w = await soloWords(bt, alice.address);
      await mine(r * 3);
      for (const x of w) await bt.connect(alice).typeSolo(x);
    }
    const h = await bt.soloHistory(alice.address);
    expect(h.length).to.equal(2);
    expect(h[1]).to.be.greaterThan(h[0]);
  });

  it("pool size is prime, so words never repeat within a run", async () => {
    const n = SOLO_POOL.length;
    for (let d = 2; d * d <= n; d++) expect(n % d).to.not.equal(0);
    for (const seed of [ethers.ZeroHash, ethers.keccak256("0x01"), ethers.keccak256("0x02"), ethers.MaxUint256.toString(16).padStart(64, "0").replace(/^/, "0x")]) {
      const idx = Array.from({ length: n }, (_, i) => walkIndex(seed, i));
      expect(new Set(idx).size).to.equal(n);
    }
  });
});
