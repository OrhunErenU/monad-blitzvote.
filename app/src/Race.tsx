import { useEffect, useMemo, useRef, useState } from "react";
import { zeroAddress, type Address } from "viem";
import {
  CONFIG,
  contract,
  makeBlockClock,
  publicClient,
  readEventName,
  readSoloTop,
  readState,
  readWords,
  type GameState,
  type SoloEntry,
} from "./chain";

type Player = { done: number; rank?: number; blocks?: number; last: bigint };
type BlockBar = { n: bigint; count: number };

const MAX_RANGE = 100n; // public RPC getLogs limit
const BAR_COUNT = 60;
const LANES = 12;

/** Projector view.  F = fullscreen */
export default function Race() {
  const clock = useRef(makeBlockClock());
  const [eventName, setEventName] = useState("");
  const [st, setSt] = useState<GameState | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [txCount, setTxCount] = useState(0);
  const [bars, setBars] = useState<BlockBar[]>([]);
  const [record, setRecord] = useState(0);
  const [tps, setTps] = useState(0);
  const [head, setHead] = useState(0n);
  const [, setTick] = useState(0);
  const recent = useRef<{ t: number; n: number }[]>([]);
  const roundRef = useRef(0);
  const cursor = useRef<bigint | null>(null);
  const askedNames = useRef(new Set<string>());
  const [soloTop, setSoloTop] = useState<SoloEntry[]>([]);
  const [soloBump, setSoloBump] = useState(0);

  // solo records: refresh slowly, and right after someone finishes a solo run
  useEffect(() => {
    const load = () => readSoloTop().then(setSoloTop).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [soloBump]);

  useEffect(() => {
    readEventName().then(setEventName).catch(() => {});
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  // round info
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const s = await readState(zeroAddress);
        if (!alive) return;
        clock.current.observe(s.blockNumber);
        setSt(s);
        if (s.round !== roundRef.current && s.round !== 0) {
          roundRef.current = s.round;
          setWords(await readWords(s.round, s.startedAt));
          setPlayers({});
          setTxCount(0);
          setBars([]);
          setRecord(0);
          recent.current = [];
          cursor.current = s.startedAt - 1n; // backfill this round's events
        }
      } catch {
        /* retry next tick */
      }
    };
    run();
    const id = setInterval(run, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // live event tail
  useEffect(() => {
    let alive = true;
    let busy = false;
    const step = async () => {
      if (busy) return;
      busy = true;
      try {
        const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
        if (!alive) return;
        clock.current.observe(latest);
        setHead(latest);
        if (cursor.current === null) cursor.current = latest;
        if (latest > cursor.current) {
          let from = cursor.current + 1n;
          if (latest - from > MAX_RANGE * 6n) from = latest - MAX_RANGE * 6n;
          const perBlock = new Map<bigint, number>();
          const upd: Record<string, Player> = {};
          const newNames: Record<string, string> = {};
          let n = 0;
          for (let a = from; a <= latest; a += MAX_RANGE) {
            const b = a + MAX_RANGE - 1n > latest ? latest : a + MAX_RANGE - 1n;
            const logs = await publicClient.getContractEvents({ ...contract, fromBlock: a, toBlock: b });
            for (const l of logs) {
              if (l.eventName === "Named") {
                const args = l.args as { player: Address; name: string };
                newNames[args.player.toLowerCase()] = args.name;
                continue;
              }
              if (l.eventName === "SoloTyped") {
                // solo words count towards the block strip and tx/s too: it's all on-chain typing
                n++;
                perBlock.set(l.blockNumber!, (perBlock.get(l.blockNumber!) ?? 0) + 1);
                continue;
              }
              if (l.eventName === "SoloFinished") {
                setSoloBump((b) => b + 1);
                continue;
              }
              if (l.eventName !== "Typed" && l.eventName !== "Finished") continue;
              const args = l.args as { round: bigint; player: Address; wordIndex?: bigint; rank?: bigint; blocksTaken?: bigint };
              if (Number(args.round) !== roundRef.current) continue;
              const key = args.player.toLowerCase();
              const cur = upd[key] ?? { done: 0, last: 0n };
              if (l.eventName === "Typed") {
                n++;
                perBlock.set(l.blockNumber!, (perBlock.get(l.blockNumber!) ?? 0) + 1);
                upd[key] = { ...cur, done: Math.max(cur.done, Number(args.wordIndex!) + 1), last: l.blockNumber! };
              } else {
                upd[key] = { ...cur, rank: Number(args.rank), blocks: Number(args.blocksTaken) };
              }
            }
          }
          if (!alive) return;
          if (Object.keys(upd).length) {
            setPlayers((old) => {
              const out = { ...old };
              for (const [k, v] of Object.entries(upd)) {
                const o = out[k] ?? { done: 0, last: 0n };
                out[k] = { done: Math.max(o.done, v.done), last: v.last || o.last, rank: v.rank ?? o.rank, blocks: v.blocks ?? o.blocks };
              }
              return out;
            });
          }
          if (Object.keys(newNames).length) setNames((o) => ({ ...o, ...newNames }));
          if (n) {
            setTxCount((c) => c + n);
            recent.current.push({ t: Date.now(), n });
          }
          setBars((old) => {
            const next = [...old];
            for (let bn = from; bn <= latest; bn++) next.push({ n: bn, count: perBlock.get(bn) ?? 0 });
            return next.slice(-BAR_COUNT);
          });
          const maxNow = Math.max(0, ...perBlock.values());
          setRecord((r) => (maxNow > r ? maxNow : r));
          cursor.current = latest;
        }
        const now = Date.now();
        recent.current = recent.current.filter((x) => now - x.t < 10_000);
        setTps(recent.current.reduce((a, x) => a + x.n, 0) / 10);
      } catch {
        /* transient RPC error */
      } finally {
        busy = false;
      }
    };
    const id = setInterval(step, 350);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // names set before this screen opened: fetch once per unknown player (batched via Multicall3)
  useEffect(() => {
    const missing = Object.keys(players).filter((k) => !(k in names) && !askedNames.current.has(k));
    if (!missing.length) return;
    missing.forEach((k) => askedNames.current.add(k));
    Promise.all(
      missing.map((k) => publicClient.readContract({ ...contract, functionName: "nameOf", args: [k as Address] }).catch(() => ""))
    ).then((res) => setNames((o) => ({ ...o, ...Object.fromEntries(missing.map((k, i) => [k, res[i] || ""])) })));
  }, [players, names]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const total = words.length || st?.wordCount || 0;
  const ms = clock.current.msPerBlock();
  const now = clock.current.now();
  const phase = !st || st.round === 0 ? "idle" : now < st.startBlock ? "countdown" : now > st.endBlock ? "over" : "live";
  const countdown = st ? Math.max(0, Math.ceil((Number(st.startBlock - now) * ms) / 1000)) : 0;
  const left = st ? Math.max(0, Math.ceil((Number(st.endBlock - now) * ms) / 1000)) : 0;

  const lanes = useMemo(() => {
    return Object.entries(players)
      .map(([k, p]) => ({ k, ...p }))
      .sort((a, b) => {
        if (a.rank && b.rank) return a.rank - b.rank;
        if (a.rank) return -1;
        if (b.rank) return 1;
        return b.done - a.done || Number(a.last - b.last);
      });
  }, [players]);
  const label = (k: string) => names[k] || `${k.slice(0, 6)}…${k.slice(-4)}`;
  const maxBar = Math.max(1, record, ...bars.map((b) => b.count));
  const podium = lanes.filter((l) => l.rank).slice(0, 3);

  const leaderDone = lanes[0]?.done ?? 0;
  // between room rounds the projector shows the solo records
  const showSolo = phase === "idle" || (phase === "over" && st !== null && now - st.endBlock > 150n);
  const statusLabel =
    phase === "idle" ? "Bekleniyor" : phase === "countdown" ? "Geri sayım" : phase === "live" ? "Canlı" : "Bitti";

  return (
    <div className="screen">
      <header className="sbar">
        <div>
          <span className="wordmark" lang="en">
            BlitzType<span className="cur" />
          </span>
        </div>
        <div className="ev" lang="en">{eventName}</div>
        <div className="rnd">{st?.round ? `Tur ${st.round}` : "—"}</div>
        <div className={`st ${phase}`}>{statusLabel}</div>
      </header>

      {phase === "countdown" ? (
        <main className="s-take">
          <div>
            <div className="sub">Başlıyor · {total} kelime</div>
            <div className="giant">{countdown}</div>
            <div className="sub">Her doğru kelime bir Monad işlemi · sırayı zincir belirler</div>
          </div>
        </main>
      ) : (
        <main className="sgrid">
          {showSolo ? (
            <section className="tower solo-board" aria-label="Bireysel rekorlar">
              <div className="thead">
                <span>Sıra</span>
                <span>Bireysel test · 15 kelime</span>
                <span>Süre</span>
                <span style={{ textAlign: "right" }}>Blok</span>
              </div>
              {soloTop.map((t, i) => (
                <div key={t.player} className={`trow${i === 0 ? " leader" : ""}`}>
                  <span className="p">{i + 1}</span>
                  <span className="n">{t.name}</span>
                  <span className="t mono">≈{((t.best * ms) / 1000).toFixed(1)} sn</span>
                  <span className="g">{t.best} blok</span>
                </div>
              ))}
              {soloTop.length === 0 && <div className="tempty">Bireysel rekor yok · telefondan “Bireysel test”</div>}
            </section>
          ) : (
          <section className="tower" aria-label="Sıralama">
            {phase === "over" && podium.length > 0 && (
              <div className="podium">
                <div className="chequer" aria-hidden />
                <div className="rows">
                  {podium.map((p) => (
                    <div key={p.k} className={`pr${p.rank === 1 ? " first" : ""}`}>
                      <span className="k1">{p.rank}</span>
                      <span className="nm">{label(p.k)}</span>
                      <span className="bk">{p.blocks} blok</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="thead">
              <span>Sıra</span>
              <span>Yarışçı · {lanes.length}</span>
              <span>Kelimeler</span>
              <span style={{ textAlign: "right" }}>Fark</span>
            </div>
            {lanes.slice(0, phase === "over" && podium.length ? LANES - 4 : LANES).map((p, i) => (
              <div key={p.k} className={`trow${i === 0 && phase === "live" ? " leader" : ""}${p.rank ? " fin" : ""}`}>
                <span className="p">{p.rank ?? i + 1}</span>
                <span className="n">{label(p.k)}</span>
                <span className="bar" aria-label={`${p.done}/${total}`}>
                  {Array.from({ length: total }, (_, w) => (
                    <span key={w} className={w < p.done ? "on" : ""} />
                  ))}
                </span>
                <span className={`g${p.rank ? " fin" : ""}`}>
                  {p.rank ? `${p.blocks} blok` : i === 0 ? `${p.done}/${total}` : `−${leaderDone - p.done}`}
                </span>
              </div>
            ))}
            {lanes.length === 0 && <div className="tempty">İlk kelime bekleniyor…</div>}
          </section>
          )}

          <section className="telemetry">
            <div className="tele-top">
              <span className="kicker">{showSolo ? "Zincire yazılan kelime · bu ekran açıkken" : "Bu turda zincire yazılan kelime"}</span>
              <div className="bignum">{txCount.toLocaleString("tr-TR")}</div>
            </div>
            <div className="metrics">
              <div>
                <div className="v">{tps.toFixed(1)}</div>
                <div className="k">tx / sn</div>
              </div>
              <div>
                <div className="v">{record}</div>
                <div className="k">blok başına rekor</div>
              </div>
              <div>
                <div className="v">{phase === "live" ? `${left} sn` : `#${head.toString()}`}</div>
                <div className="k">{phase === "live" ? "kalan süre" : "blok"}</div>
              </div>
            </div>
            <div className="strip" aria-hidden>
              <div className="cols">
                {bars.map((b) => (
                  <div
                    key={b.n.toString()}
                    className={`col${b.count > 0 && b.count === maxBar ? " peak" : ""}`}
                    style={{ height: `${(b.count / maxBar) * 100}%` }}
                  >
                    {b.count > 0 && b.count === maxBar && <span>{b.count}</span>}
                  </div>
                ))}
              </div>
              <div className="cap">
                <span>Her sütun bir Monad bloğu · ~{Math.round(ms)} ms</span>
                <span>blok #{head.toString()}</span>
              </div>
            </div>
            {words.length > 0 && <div className="wordline">{words.join("  ")}</div>}
          </section>
        </main>
      )}

      <footer className="sfoot">
        <span className="onmonad" lang="en">on Monad testnet</span>
        <span className="addr">{CONFIG.address}</span>
        <span>F · tam ekran</span>
      </footer>
    </div>
  );
}
