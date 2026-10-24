# BlitzType brand kit

**Direction: race timing sheet + keycaps.** A typing race shown on a projector in a lit room and on phones held at arm's length. The UI borrows from motorsport timing towers (position chips, condensed caps, gap column, chequered finish) and from mechanical keyboards (each letter is a keycap that "presses" when typed).

## Why light
Projectors can't render black; in a lit venue dark UIs turn grey and lose contrast. Ink on paper-white reads from the back of the room.

## Colour — every colour has exactly one job
| Token | Hex | Role (and nothing else) |
|---|---|---|
| `--paper` | `#FFFFFF` | canvas |
| `--ink` | `#111111` | text, rules, filled keycaps, typed segments |
| `--live` | `#FFD400` | **live**: countdown takeover, race leader row, LIVE status, typed-but-unconfirmed word |
| `--chain` | `#0A8F4E` | **confirmed on-chain**: confirmed segments, finish blocks, receipt latency |
| `--fault` | `#E10600` | **wrong**: wrong keycap, wrong input, errors |
| `--monad` | `#836EF9` | the small "on Monad" mark only |
| chequer | ink/paper | finish and podium only |

## Type
- **Archivo Variable** (self-hosted): `wdth 125` for numbers and the wordmark, `wdth 70–80` for names, labels and headlines. All caps always carry `0.06–0.12em` tracking.
- **IBM Plex Mono**: words to type, metrics, receipts, addresses, so numbers stay tabular.
- Brand/English strings use `lang="en"` so Turkish casing doesn't turn BlitzType into BLİTZTYPE; Turkish UI copy keeps `lang="tr"` (KELİMELER, BİTİRDİN).

## Components
- **Keycap**: 1.5 px ink border with a 5 px bottom edge. A typed letter fills ink and drops 3 px; a wrong letter fills fault red.
- **Segments**: one cell per word. Live yellow = typed, chain green = confirmed. They replace smooth progress bars.
- **Timing tower row**: ink position chip, condensed caps name, segment bar, gap ("−3") or finish ("17 blok").
- **Block strip**: one ink column per Monad block. The record block is live yellow.
- **Takeover**: the countdown fills the whole screen with live yellow.
- Radius 0, no shadows except the keycap edge, no gradients, no emoji, no cards; rows and rules instead.
