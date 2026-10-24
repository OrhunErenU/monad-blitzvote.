# BlitzVote ⚡

**On-chain audience voting and live applause for hackathon demo nights, built on Monad.**

Every attendee gets a printed QR card. Scanning it opens the app with a pre-funded burner wallet that is already whitelisted in the contract: no wallet install, no faucet, no signature pop-ups. Each card casts **one** vote, team cards **cannot vote for their own project**, and during demos everyone can tap emoji reactions, each one a Monad transaction. A projector view shows, block by block, how many transactions the room is pushing into Monad, then reveals the results bottom-up when voting closes.

> Built during **Monad Blitz Ankara v4** (Oct 24, 2026). All code in this repo was written at the event; see the commit history.

| | |
|---|---|
| Contract | `contracts/contracts/BlitzVote.sol`, deployed on Monad Testnet (chain 10143) |
| App | `app/`: React + Vite + viem. `#/` phone voting screen, `#/screen` projector |
| Live demo | _add Vercel URL_ |
| Contract address | _add after `npm run deploy`_ · [MonadVision](https://testnet.monadvision.com) |

## Why it needs the chain

A room vote is only worth something if nobody can quietly change it. Here every rule lives in the contract, not in a server or a spreadsheet:

- **One card, one vote.** Enforced with `voteOf[msg.sender]`, reverts with `AlreadyVoted`.
- **No self-votes.** Team cards are bound to their project at registration, reverts with `OwnProject`.
- **Only registered cards.** Reverts with `NotVoter`. Voting only while `Open`.
- **Anyone can audit the tally.** `snapshot()` / `votesFor()` are public, and every vote is a `Voted` event.

What is still trusted (being upfront): the organizer issues the cards, and votes are public on-chain. The projector hides results until close, but the chain does not. Commit-reveal is the next step.

## Built for Monad specifically

| Monad property | What BlitzVote does with it |
|---|---|
| **300 ms blocks, 600 ms finality** + **`eth_sendRawTransactionSync`** | A vote is signed on the phone and confirmed in **one RPC call** that returns the receipt. The UI shows "on-chain in 0.x s · block #N". |
| **Optimistic parallel execution** (re-runs txs that touch the same state) | Vote counters are **sharded** (`votes[project][voter % 16]`), so a room voting for the same project in the same second doesn't all write one storage slot. Reactions write **no storage at all**: they only check and emit an event, so they never conflict. |
| **Gas is charged on the gas *limit*** | The app sets every limit from `estimateGas × 1.3` (capped). Cards are funded with the same formula, so a card holds just enough for 1 vote + N reactions. `npm run rehearse` measures real gas on testnet. |
| **10 MON reserve balance** for EOAs | The funding script spaces its value-carrying txs so each one qualifies for Monad's "emptying" exception. Burners only ever spend gas. |
| **Public RPC limits** (25 rps for `eth_call` on the main endpoint) | Each phone picks a random primary among three public RPCs and falls back to the others. Reads are batched through canonical Multicall3. The nonce is tracked locally and fees are cached, so one reaction = one request. Reactions are capped at 2/s per device; extra taps still animate. |

## Run it

Requirements: Node 20+, a funded Monad testnet wallet (≥ 10 MON recommended because of the reserve rule; tokens via [blitz.devnads.com](https://blitz.devnads.com) or [faucet.monad.xyz](https://faucet.monad.xyz)).

```bash
cd contracts
npm install
cp .env.example .env        # set PRIVATE_KEY (and APP_URL once the app is deployed)
npm test                    # 11 tests

npm run rehearse            # throwaway deploy: measures real vote/react gas, sync-receipt support, cost per card
npm run deploy              # real deploy → writes app/src/deployment.json (commit it)
npm run verify              # MonadVision (Sourcify); Monadscan too if ETHERSCAN_API_KEY is set

# edit projects.json → [{ "name": "...", "team": "...", "members": 3 }]
npm run projects            # projects can only be added before voting opens
DRY_RUN=1 npm run voters    # shows the MON budget
npm run voters              # creates + registers + funds burners, writes out/qr-*.html (print it)

npm run open                # voting on   (reactions already work before this)
npm run close               # voting off → press R on the projector for the reveal
npm run status              # tally in the terminal
REACTIONS=5 npm run simulate  # every card in the latest batch votes + reacts at once (load demo)
```

Frontend:
```bash
cd app && npm install && npm run dev      # http://localhost:5173/#/screen
```
Deploy `app/` to Vercel (Root Directory: `app`). Optional env: `VITE_RPC_URLS` (comma-separated), `VITE_BLITZVOTE_ADDRESS`, `VITE_CHAIN_ID`, `VITE_EXPLORER_URL`.

Projector keys: **F** fullscreen · **← →** project on stage · **R** reveal results (after close).

### Local chain (no testnet needed)
```bash
cd contracts && npx hardhat node                       # terminal 1
npm run deploy:local                                    # terminal 2
npx hardhat run scripts/add-projects.ts --network localhost
AUDIENCE=20 TEAM_QR=1 npx hardhat run scripts/make-voters.ts --network localhost
PHASE=open npx hardhat run scripts/phase.ts --network localhost
```
Open `http://localhost:5173/#/v/<privateKey from out/voters-*.csv>` for a voter.

## Repo map
```
contracts/
  contracts/BlitzVote.sol    whitelist · one vote · no self-vote · sharded tally · event-only reactions
  test/BlitzVote.test.ts     11 tests incl. 100-voter burst and gas ceilings
  scripts/                   deploy · add-projects · make-voters (QR cards) · phase · status · simulate · rehearse · verify
app/src/
  chain.ts                   RPC fallback, Multicall3, burner signer (local nonce, cached fees, sync send)
  Vote.tsx                   phone UI
  Screen.tsx                 projector: tx counter, per-block bars, applause meter, reveal
```

## Security notes
- **A QR card is a private key.** Whoever photographs it can use that vote, so hand cards out physically. The key lives in the URL fragment (`#…`, never sent to a server) and is stripped from the address bar on load.
- Burners hold only a few cents of testnet MON.
- `out/` (keys) and `.env` are git-ignored.

## Next
- One-time signed claim codes + sponsored gas instead of pre-funded cards
- Commit-reveal for secret ballots
- Factory so every event gets its own ballot, with results feeding an event platform

Turkish event-day runbook: [`ETKINLIK.md`](ETKINLIK.md) · Pitch script: [`PITCH.md`](PITCH.md)
