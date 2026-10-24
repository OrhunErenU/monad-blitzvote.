import { expect } from "chai";
import { ethers } from "hardhat";

describe("BlitzVote", () => {
  async function setup() {
    const [organizer, alice, bob, carol, teamA, outsider] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BlitzVote");
    const bv = await F.deploy("Monad Blitz Ankara");
    await bv.addProjects(["Alpha", "Beta", "Gamma"], ["Team A", "Team B", "Team C"]);
    // audience
    await bv.registerVoters([alice.address, bob.address, carol.address], 0);
    // teamA belongs to project 0 (Alpha) -> projectId+1 = 1
    await bv.registerVoters([teamA.address], 1);
    return { bv, organizer, alice, bob, carol, teamA, outsider };
  }

  it("registers projects and voters", async () => {
    const { bv } = await setup();
    expect(await bv.projectCount()).to.equal(3n);
    expect(await bv.voterCount()).to.equal(4n);
    const p = await bv.getProjects();
    expect(p[1].name).to.equal("Beta");
  });

  it("only organizer can manage", async () => {
    const { bv, alice } = await setup();
    await expect(bv.connect(alice).openVoting()).to.be.revertedWithCustomError(bv, "NotOrganizer");
    await expect(bv.connect(alice).addProjects(["X"], ["Y"])).to.be.revertedWithCustomError(bv, "NotOrganizer");
    await expect(bv.connect(alice).registerVoters([alice.address], 0)).to.be.revertedWithCustomError(bv, "NotOrganizer");
  });

  it("cannot vote before open", async () => {
    const { bv, alice } = await setup();
    await expect(bv.connect(alice).vote(0)).to.be.revertedWithCustomError(bv, "WrongPhase");
  });

  it("one person one vote, sharded totals add up", async () => {
    const { bv, alice, bob, carol } = await setup();
    await bv.openVoting();
    await expect(bv.connect(alice).vote(1)).to.emit(bv, "Voted").withArgs(alice.address, 1);
    await bv.connect(bob).vote(1);
    await bv.connect(carol).vote(2);
    await expect(bv.connect(alice).vote(2)).to.be.revertedWithCustomError(bv, "AlreadyVoted");
    expect(await bv.votesFor(1)).to.equal(2n);
    expect(await bv.votesFor(2)).to.equal(1n);
    expect(await bv.votesFor(0)).to.equal(0n);
    expect(await bv.totalVotes()).to.equal(3n);
    expect(await bv.voteOf(alice.address)).to.equal(2n); // projectId 1 + 1
  });

  it("blocks non-voters and unknown projects", async () => {
    const { bv, outsider, alice } = await setup();
    await bv.openVoting();
    await expect(bv.connect(outsider).vote(0)).to.be.revertedWithCustomError(bv, "NotVoter");
    await expect(bv.connect(alice).vote(9)).to.be.revertedWithCustomError(bv, "UnknownProject");
  });

  it("team members cannot vote for their own project but can vote for others", async () => {
    const { bv, teamA } = await setup();
    await bv.openVoting();
    await expect(bv.connect(teamA).vote(0)).to.be.revertedWithCustomError(bv, "OwnProject");
    await bv.connect(teamA).vote(1);
    expect(await bv.votesFor(1)).to.equal(1n);
  });

  it("reactions are events only and stop after close", async () => {
    const { bv, alice } = await setup();
    await expect(bv.connect(alice).react(0, 1)).to.emit(bv, "Reacted").withArgs(alice.address, 0, 1);
    await bv.openVoting();
    await bv.connect(alice).react(2, 3);
    await bv.closeVoting();
    await expect(bv.connect(alice).react(0, 1)).to.be.revertedWithCustomError(bv, "WrongPhase");
    await expect(bv.connect(alice).vote(0)).to.be.revertedWithCustomError(bv, "WrongPhase");
  });

  it("splits funding between burners and refunds dust", async () => {
    const [organizer] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BlitzVote");
    const bv = await F.deploy("x");
    await bv.addProjects(["A"], ["T"]);
    const w1 = ethers.Wallet.createRandom().address;
    const w2 = ethers.Wallet.createRandom().address;
    const w3 = ethers.Wallet.createRandom().address;
    await bv.connect(organizer).registerVoters([w1, w2, w3], 0, { value: 10n });
    expect(await ethers.provider.getBalance(w1)).to.equal(3n);
    expect(await ethers.provider.getBalance(w3)).to.equal(3n);
    expect(await ethers.provider.getBalance(await bv.getAddress())).to.equal(0n);
  });

  it("snapshot returns everything", async () => {
    const { bv, alice } = await setup();
    await bv.openVoting();
    await bv.connect(alice).vote(2);
    const s = await bv.snapshot();
    expect(s[0]).to.equal(1n); // Open
    expect(s[1]).to.equal(4n);
    expect(s[2]).to.equal(1n);
    expect(s[3].length).to.equal(3);
    expect(s[4][2]).to.equal(1n);
  });

  it("gas usage stays small (Monad charges the gas limit, so we size limits from this)", async () => {
    const { bv, alice } = await setup();
    await bv.openVoting();
    const v = await (await bv.connect(alice).vote(0)).wait();
    const r = await (await bv.connect(alice).react(1, 2)).wait();
    console.log(`      vote gas: ${v!.gasUsed}, react gas: ${r!.gasUsed}`);
    expect(v!.gasUsed).to.be.lessThan(120_000n);
    expect(r!.gasUsed).to.be.lessThan(40_000n);
  });

  it("handles a burst of 100 voters", async () => {
    const F = await ethers.getContractFactory("BlitzVote");
    const bv = await F.deploy("burst");
    await bv.addProjects(["A", "B"], ["TA", "TB"]);
    const [funder] = await ethers.getSigners();
    const wallets = Array.from({ length: 100 }, () => ethers.Wallet.createRandom().connect(ethers.provider));
    await bv.registerVoters(
      wallets.map((w) => w.address),
      0,
      { value: ethers.parseEther("1") }
    );
    await bv.openVoting();
    await Promise.all(wallets.map((w, i) => bv.connect(w).vote(i % 2)));
    expect(await bv.votesFor(0)).to.equal(50n);
    expect(await bv.votesFor(1)).to.equal(50n);
    expect(await bv.totalVotes()).to.equal(100n);
    void funder;
  });
});
