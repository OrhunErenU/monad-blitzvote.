import { expect } from "chai";
import { ethers, network } from "hardhat";

const WORDS = ["monad", "blok", "hizli", "zincir"];

async function mine(n: number) {
  await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
}

describe("BlitzType", () => {
  async function setup(delay = 0, duration = 100) {
    const [org, alice, bob, carol] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["Monad Blitz Ankara"]);
    await bt.startRound(WORDS, delay, duration);
    return { bt, org, alice, bob, carol };
  }

  it("only organizer starts rounds and funds", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x"]);
    await expect(bt.connect(alice).startRound(WORDS, 0, 10)).to.be.revertedWithCustomError(bt, "NotOrganizer");
    await expect(bt.connect(alice).fund([alice.address])).to.be.revertedWithCustomError(bt, "NotOrganizer");
  });

  it("rejects typing before any round", async () => {
    const [, alice] = await ethers.getSigners();
    const bt = await ethers.deployContract("BlitzType", ["x"]);
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
    const bt = await ethers.deployContract("BlitzType", ["x"]);
    await expect(bt.startRound([], 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(Array(33).fill("a"), 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(["a", ""], 0, 10)).to.be.revertedWithCustomError(bt, "BadWords");
    await expect(bt.startRound(["a"], 0, 0)).to.be.revertedWithCustomError(bt, "BadWords");
  });

  it("funds players and refunds dust", async () => {
    const bt = await ethers.deployContract("BlitzType", ["x"]);
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
    const bt = await ethers.deployContract("BlitzType", ["burst"]);
    const players = Array.from({ length: 50 }, () => ethers.Wallet.createRandom().connect(ethers.provider));
    await bt.fund(players.map((p) => p.address), { value: ethers.parseEther("1") });
    await bt.startRound(WORDS, 0, 1000);
    for (const w of WORDS) await Promise.all(players.map((p) => bt.connect(p).typeWord(w)));
    expect(await bt.finisherCount(1)).to.equal(50n);
    void org;
  });
});
