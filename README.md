# BlitzType ⌨️⚡

**On-chain typing speed: race the whole room, or beat your own record. Every correct word is a Monad transaction.**

Three ways to play, one contract:

- **Online rooms**: anyone opens a room and gets a code (`createRoom`), friends join with the code or an invite link (`joinRoom`), the host starts (`startRoom`) and everyone races live. Words are drawn from the on-chain pool at start; each player's progress, rank and blocks taken live in the contract (`roomBoard`), and room wins are counted on-chain (`roomWins`), shown next to each name with a winner reveal at the end.
- **Stage round** (event mode): the organizer starts a round for the whole hall from `/#/admin`; the projector shows live lanes and the podium.
- **Solo test** (individual, any time, Monkeytype-style): `startSolo()` draws 15 words for you on-chain, you type them, and your score is the number of blocks from start to your last word. Personal bests, the full history of your runs (`soloHistory`) and a top-10 board live in the contract.

The organizer starts a round with a list of words. Everyone in the room scans a QR card (a pre-funded burner wallet, no install, no pop-ups), picks a name, and races to type the words on their phone. **Each correct word is submitted on-chain and checked against its hash by the contract**, so no one can skip a word or fake progress, and **finish order is decided by consensus, not a game server**. The projector shows live lanes, words per block and the podium.

> Built during **Monad Blitz Ankara v4** (Oct 24, 2026). All code in this repo was written at the event (commit history). An earlier idea from the same day, BlitzVote, is in the history.

| | |
|---|---|
| Contract | `contracts/contracts/BlitzType.sol` on Monad Testnet (chain 10143) |
| Live app | https://orhunerenu.github.io/monad-blitzvote./ (opens straight into the game; a wallet is created in the browser) · QR card: `/#/p/<card>` · invite: `/#/?room=<code>` · projector: `/#/screen` · organizer: `/#/admin` |
| Contract address | [`0xdf5F7Bd6059f88085eA8079671a7bF799284006e`](https://testnet.monadvision.com/address/0xdf5F7Bd6059f88085eA8079671a7bF799284006e) (verified, Sourcify "perfect") |

## Why it needs the chain

Typing games normally trust a server for scores. Here the contract is the referee:

- **Words are verified on-chain.** `typeWord(word)` reverts with `WrongWord` unless `keccak256(word)` equals the hash of the caller's next word. Skipping, reordering and replaying all fail.
- **Timing is the chain's.** Typing is only accepted between `startBlock` and `endBlock` (`NotStarted` / `RoundOver`).
- **Finish order is consensus.** The first `typeWord` that completes the list gets rank 1 (`finisherAt[round][rank]`); `blocksTaken` is recorded on-chain.
- **Anyone can audit a race.** Every word is a `Typed` event; `podium()` and `progressOf()` are public.
- **Solo words are picked by the contract.** `startSolo()` derives a seed from the previous block hash and `prevrandao`; Word *i* is `pool[(start + i·step) mod n]` with `start`/`step` from the seed; the 211-word English pool has a prime size, so **no word repeats inside a run or a room**. The pool is stored as packed 8-byte hashes (4 per slot) at deploy time. Words are only accepted from the block after `startSolo`, so the score (blocks taken) is the chain's clock, not the phone's. Only a personal best touches the shared top-10 array, so solo players don't contend with each other.

### Compared with prior typing games
- **Typeflood Racer** (ETHGlobal Paris, Neon prize) turned typing speed into transactions as crowdsourced load testing.
- **TypeStrike** (a Monad Blitz project) is a 1v1 duel synced over WebRTC, with the chain holding wager escrow.

BlitzType puts **the gameplay itself on-chain**, for **the whole room at once**, with **no wagering**.

## Built for Monad specifically

| Monad property | What BlitzType does with it |
|---|---|
| **~300–400 ms blocks** | A word lands in the next block, so a 60 wpm typist produces about one transaction per second. On a 12 s chain the whole race would fit in 3–4 blocks and "who finished first" would be meaningless. |
| **Optimistic parallel execution** (re-runs only txs that touch the same state) | The hot path **reads** round data written once at round start and **writes only the caller's own progress slot**, so players never conflict. The only shared write is the finisher counter, hit once per finishing player and kept in its own slot so ordinary words never touch it. |
| **MIP-8 storage pages** (128-slot pages, cold cost paid once per page) | Round fields and all word hashes live in one struct, so they're usually one cold page per tx. |
| **`eth_sendRawTransactionSync`** | Each word is signed on the phone and confirmed in **one RPC call** that returns the receipt ("last word in block 0.3 s"). It falls back to polling if the RPC lacks it. |
| **Gas charged on the limit** | Limits come from `estimateGas × 1.3`. Cards are funded from measured gas (`npm run rehearse`). |
| **10 MON reserve balance** | Funding txs are spaced so each qualifies for the "emptying" exception. Players only spend gas. |
| **Public RPC limits** | Each phone picks a random primary among three public RPCs with fallback, reads go through Multicall3, and the nonce is tracked locally, so one word = one request. Phones barely poll during a race. |

## Run the event from a phone: organizer panel (`/#/admin`)

No terminal needed. The panel creates an organizer wallet in the browser (the key never leaves that device), shows its address to fund with testnet MON, then runs everything:

1. **Deploy** BlitzType straight from the browser (bytecode is bundled). The app picks the address up at runtime via `?c=0x…`, so no rebuild is needed.
2. **Cards**: generate N burner wallets, fund them via `fund()` (spaced for Monad's reserve-balance rule), and print a QR sheet. Each QR is `…/#/p/<key>?c=<contract>`.
3. **Round**: words / seconds / countdown → `startRound`. Seconds are converted to blocks from the measured block time. "End now" calls `endRound`.
4. **Bots**: spawn and fund N fresh wallets that set names and type at human speed, for a load demo or a quiet room.

The CLI scripts below do the same things from a laptop.

## Run it

Requirements: Node 20+, a Monad testnet wallet with MON (≥ 10 MON is easiest because of the reserve rule; tokens via [blitz.devnads.com](https://blitz.devnads.com) or [faucet.monad.xyz](https://faucet.monad.xyz)).

```bash
cd contracts
npm install
cp .env.example .env         # PRIVATE_KEY, later APP_URL
npm test                     # 19 tests incl. a 50-player race, rooms and solo mode

npm run rehearse             # throwaway deploy: real gas per word, sync-receipt support, latency
npm run deploy               # writes app/src/deployment.json (commit it)
# behind an HTTPS proxy Hardhat may not reach the RPC; plain ethers does:
# NODE_USE_ENV_PROXY=1 PRIVATE_KEY=0x… node scripts/deploy-direct.cjs && node scripts/smoke-direct.cjs
npm run verify               # MonadVision (Sourcify); Monadscan if ETHERSCAN_API_KEY is set

DRY_RUN=1 npm run cards      # MON budget for PLAYERS × ROUNDS × WORDS
npm run cards                # burner wallets + funding + out/cards-*.html (print)

npm run round                # new round: WORDS=15 ROUND_SECONDS=45 COUNTDOWN=5
npm run simulate             # bots from the latest cards file race at human speed (demo / load)
npm run leaderboard
END=1 npm run round          # end the current round early
```

Frontend:
```bash
cd app && npm install && npm run dev       # phone: http://localhost:5173/#/p/<privateKey> · projector: /#/screen
```
Deploy `app/` to Vercel (Root Directory `app`). Optional env: `VITE_RPC_URLS`, `VITE_BLITZTYPE_ADDRESS`, `VITE_CHAIN_ID`, `VITE_EXPLORER_URL`.

### Local chain
```bash
cd contracts && npx hardhat node                 # terminal 1
npm run deploy:local                              # terminal 2
PLAYERS=10 npx hardhat run scripts/make-cards.ts --network localhost
npx hardhat run scripts/round.ts --network localhost
npx hardhat run scripts/simulate.ts --network localhost
```

## Repo map
```
contracts/contracts/BlitzType.sol   rounds · on-chain word check · per-player progress · finish order · names · funding · solo runs + top 10
contracts/test/BlitzType.test.ts    19 tests (countdown/end block, wrong words, order, podium, 50 concurrent players, rooms, solo + history, gas)
contracts/scripts/                  deploy · rehearse · verify · make-cards · round · simulate · leaderboard · words
app/src/chain.ts                    RPC fallback, Multicall3, burner signer (local nonce, cached fees, sync send)
app/src/Play.tsx                    phone: name → mode tabs (room race / solo) → countdown → type → rank
app/src/Room.tsx                    phone: create / join by code → lobby → countdown → live race with everyone's progress
app/src/Solo.tsx                    phone: solo test, personal best, run history, top 10
app/src/Race.tsx                    projector: lanes, words per block, podium; solo records between rounds
```

## Honest limits
- Words are public once a round starts (that's the point: everyone types the same list). A bot could type faster than a human, so this proves on-chain fairness of **order and correctness**, not human-ness.
- Ranks within the same block follow the block's transaction order, which the leader chooses.
- Solo seeds use `blockhash`/`prevrandao`, which a block producer could influence; fine for a game, not for prizes. `/#/solo` without a card makes a wallet in the browser that the player funds with testnet MON.
- **A QR card is a private key** (kept in the URL fragment and stripped from the address bar on load). Hand cards out physically. Burners hold only a few cents of testnet MON. `out/` and `.env` are git-ignored.

## Next
- Per-round prize pool paid by the contract to the podium (no wagering by players)
- Passkey accounts instead of printed cards; sponsored gas
- Team mode: sum of a table's words, aggregated on-chain

Brand kit: [`DESIGN.md`](DESIGN.md) · Turkish event runbook: [`ETKINLIK.md`](ETKINLIK.md) · 90-second pitch: [`PITCH.md`](PITCH.md)
