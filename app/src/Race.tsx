import { useEffect, useMemo, useRef, useState } from "react";
import { zeroAddress, type Address } from "viem";
import { CONFIG, contract, makeBlockClock, publicClient, readEventName, readState, readWords, type GameState } from "./chain";

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

  return (
    <div className="screen">
      <header className="shead">
        <div className="brand big">
          Blitz<span>Type</span>
        </div>
        <div className="ev">{eventName}</div>
        <div className={`pill ${phase}`}>
          {phase === "idle" ? "Bekleniyor" : `Tur ${st?.round} · ${phase === "countdown" ? "Geri sayım" : phase === "live" ? "Yarış" : "Bitti"}`}
        </div>
      </header>

      <main className="sgrid">
        <section className="hero">
          {phase === "countdown" ? (
            <>
              <div className="label">Başlıyor</div>
              <div className="counter mono">{countdown}</div>
              <div className="sub">{total} kelime · her doğru kelime bir Monad işlemi · sırayı zincir belirler</div>
            </>
          ) : (
            <>
              <div className="label">Bu turda zincire yazılan kelime</div>
              <div className="counter mono">{txCount.toLocaleString("tr-TR")}</div>
              <div className="sub">
                <span className="mono">{tps.toFixed(1)}</span> tx/sn · blok başına rekor <span className="mono">{record}</span> · blok{" "}
                <span className="mono">#{head.toString()}</span>
                {phase === "live" && (
                  <>
                    {" "}
                    · kalan <span className="mono">{left} sn</span>
                  </>
                )}
              </div>
            </>
          )}
          {phase !== "idle" && words.length > 0 && <div className="wordstrip mono">{words.join(" · ")}</div>}
          <div className="bars" aria-hidden>
            {bars.map((b) => (
              <div key={b.n.toString()} className="bar" style={{ height: `${(b.count / maxBar) * 100}%` }}>
                {b.count > 0 && b.count === maxBar && <span>{b.count}</span>}
              </div>
            ))}
          </div>
          <div className="barlabel">Her çubuk bir Monad bloğu (~{Math.round(ms)} ms): o blokta onaylanan kelime sayısı</div>
        </section>

        <section className="side">
          {phase === "over" && podium.length > 0 ? (
            <div className="card podium">
              <div className="label">Podyum</div>
              {podium.map((p) => (
                <div key={p.k} className={`pod r${p.rank}`}>
                  <span className="mono">{p.rank}</span>
                  <b>{label(p.k)}</b>
                  <span className="dim mono">{p.blocks} blok</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="card">
            <div className="label">
              Yarışçılar · {lanes.length} · bitiren {lanes.filter((l) => l.rank).length}
            </div>
            <ul className="lanes">
              {lanes.slice(0, LANES).map((p, i) => (
                <li key={p.k} className={p.rank ? "fin" : ""}>
                  <span className="mono pos">{p.rank ?? i + 1}</span>
                  <span className="lname">{label(p.k)}</span>
                  <span className="lbar">
                    <span style={{ width: `${total ? (p.done / total) * 100 : 0}%` }} />
                  </span>
                  <span className="mono lcount">{p.rank ? "✓" : `${p.done}/${total}`}</span>
                </li>
              ))}
              {lanes.length === 0 && <li className="dim empty">{phase === "idle" ? "Tur bekleniyor…" : "İlk kelime bekleniyor…"}</li>}
            </ul>
          </div>
        </section>
      </main>

      <footer className="keys dim">F tam ekran · {CONFIG.address.slice(0, 8)}…</footer>
    </div>
  );
}
