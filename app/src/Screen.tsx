import { useEffect, useMemo, useRef, useState } from "react";
import { CONFIG, contract, EMOJIS, PHASES, publicClient, readEventName } from "./chain";
import { useSnapshot } from "./hooks";

type Rain = { id: number; emoji: string; x: number; dur: number };
type BlockBar = { n: bigint; count: number };

const MAX_RANGE = 100n; // RPC getLogs range per call
const BAR_COUNT = 48;

/**
 * Projector view.
 * ← / → : choose the project on stage   ·   R : reveal results (after close)   ·   F : fullscreen
 */
export default function Screen() {
  const { snap, error } = useSnapshot(1500);
  const [eventName, setEventName] = useState("");
  const [head, setHead] = useState<bigint>(0n);
  const [txCount, setTxCount] = useState(0);
  const [reactsByProject, setReactsByProject] = useState<Record<number, number>>({});
  const [bars, setBars] = useState<BlockBar[]>([]);
  const [record, setRecord] = useState(0);
  const [rain, setRain] = useState<Rain[]>([]);
  const [stage, setStage] = useState<number | null>(null);
  const [revealStep, setRevealStep] = useState(-1);
  const recent = useRef<{ t: number; n: number }[]>([]);
  const [tps, setTps] = useState(0);
  const rainId = useRef(0);

  useEffect(() => {
    readEventName().then(setEventName).catch(() => {});
  }, []);

  // ---------------------------------------------------------------- live log tail
  useEffect(() => {
    let alive = true;
    let cursor: bigint | null = null;
    let running = false;

    const step = async () => {
      if (running) return;
      running = true;
      try {
        const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
        if (!alive) return;
        setHead(latest);
        if (cursor === null) cursor = latest; // count from the moment the screen opens
        if (latest > cursor) {
          let from = cursor + 1n;
          if (latest - from > MAX_RANGE * 3n) from = latest - MAX_RANGE + 1n; // fell behind: catch up
          const perBlock = new Map<bigint, number>();
          for (let a = from; a <= latest; a += MAX_RANGE) {
            const b = a + MAX_RANGE - 1n > latest ? latest : a + MAX_RANGE - 1n;
            const logs = await publicClient.getContractEvents({ ...contract, fromBlock: a, toBlock: b });
            if (!alive) return;
            let n = 0;
            const reacts: Record<number, number> = {};
            const drops: Rain[] = [];
            for (const l of logs) {
              if (l.eventName !== "Voted" && l.eventName !== "Reacted") continue;
              n++;
              perBlock.set(l.blockNumber!, (perBlock.get(l.blockNumber!) ?? 0) + 1);
              if (l.eventName === "Reacted") {
                const args = l.args as { projectId: bigint; emoji: number };
                const pid = Number(args.projectId);
                reacts[pid] = (reacts[pid] ?? 0) + 1;
                if (drops.length < 25) {
                  drops.push({
                    id: ++rainId.current,
                    emoji: EMOJIS[args.emoji % EMOJIS.length],
                    x: 4 + Math.random() * 92,
                    dur: 2.6 + Math.random() * 1.6,
                  });
                }
              } else {
                drops.push({ id: ++rainId.current, emoji: "🗳️", x: 4 + Math.random() * 92, dur: 3.2 });
              }
            }
            if (n) {
              setTxCount((c) => c + n);
              recent.current.push({ t: Date.now(), n });
              setReactsByProject((r) => {
                const out = { ...r };
                for (const [k, v] of Object.entries(reacts)) out[+k] = (out[+k] ?? 0) + v;
                return out;
              });
              if (drops.length) {
                setRain((old) => [...old.slice(-60), ...drops]);
                const ids = new Set(drops.map((d) => d.id));
                setTimeout(() => setRain((old) => old.filter((d) => !ids.has(d.id))), 4500);
              }
            }
          }
          // block bars, zero-filled
          setBars((old) => {
            const next = [...old];
            for (let bn = from; bn <= latest; bn++) next.push({ n: bn, count: perBlock.get(bn) ?? 0 });
            return next.slice(-BAR_COUNT);
          });
          const maxNow = Math.max(0, ...perBlock.values());
          setRecord((r) => (maxNow > r ? maxNow : r));
          cursor = latest;
        }
        const now = Date.now();
        recent.current = recent.current.filter((x) => now - x.t < 10_000);
        setTps(recent.current.reduce((a, x) => a + x.n, 0) / 10);
      } catch {
        /* transient RPC errors: next tick retries */
      } finally {
        running = false;
      }
    };
    const id = setInterval(step, 300);
    step();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ---------------------------------------------------------------- keyboard
  const nProjects = snap?.projects.length ?? 0;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStage((s) => (nProjects ? (s === null ? 0 : (s + 1) % nProjects) : null));
      if (e.key === "ArrowLeft") setStage((s) => (nProjects ? (s === null ? nProjects - 1 : (s - 1 + nProjects) % nProjects) : null));
      if (e.key === "Escape") setStage(null);
      if (e.key.toLowerCase() === "r") setRevealStep((s) => (s < 0 ? 0 : s));
      if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [nProjects]);

  // ---------------------------------------------------------------- reveal
  const ranking = useMemo(() => {
    if (!snap) return [];
    const rows = snap.projects
      .map((p, i) => ({ ...p, i, votes: snap.votes[i] ?? 0, rank: 0 }))
      .sort((a, b) => b.votes - a.votes || a.i - b.i);
    // ties share a rank: 1, 2, 3, 3, 5
    rows.forEach((r) => (r.rank = 1 + rows.filter((o) => o.votes > r.votes).length));
    return rows;
  }, [snap]);

  useEffect(() => {
    if (revealStep < 0 || revealStep >= ranking.length) return;
    // bottom of the list reveals quickly, the top three slowly
    const remaining = ranking.length - revealStep;
    const delay = remaining <= 3 ? 2600 : 700;
    const id = setTimeout(() => setRevealStep((s) => s + 1), delay);
    return () => clearTimeout(id);
  }, [revealStep, ranking.length]);

  const phase = snap?.phase ?? 0;
  const turnout = snap && snap.voterCount ? Math.round((snap.totalVotes / snap.voterCount) * 100) : 0;
  const maxBar = Math.max(1, record, ...bars.map((b) => b.count));
  const maxReact = Math.max(1, ...Object.values(reactsByProject));

  if (phase === 2 && revealStep >= 0) {
    const shown = new Set(ranking.slice(ranking.length - revealStep).map((r) => r.i));
    return (
      <div className="screen reveal">
        <h1 className="rtitle">Sonuçlar</h1>
        <ol className="rlist">
          {ranking.map((r) => {
            const visible = shown.has(r.i);
            const tied = ranking.filter((o) => o.votes === r.votes).length > 1;
            return (
              <li key={r.i} className={`rrow rank${r.rank}${visible ? " on" : ""}`}>
                <span className="rpos">
                  {r.rank}
                  {visible && tied && <small className="tie">=</small>}
                </span>
                <span className="rname">{visible ? r.name : "· · ·"}</span>
                <span className="rteam">{visible ? r.team : ""}</span>
                <span className="rvotes mono">{visible ? `${r.votes} oy` : ""}</span>
              </li>
            );
          })}
        </ol>
        <p className="rfoot mono">
          {snap?.totalVotes} oy · {snap?.voterCount} kart · hepsi Monad'da, {CONFIG.address.slice(0, 8)}…
        </p>
      </div>
    );
  }

  const onStage = stage !== null ? snap?.projects[stage] : undefined;

  return (
    <div className="screen">
      <header className="shead">
        <div className="brand big">
          Blitz<span>Vote</span>
        </div>
        <div className="ev">{eventName}</div>
        <div className={`pill p${phase}`}>{PHASES[phase]}</div>
      </header>

      <main className="sgrid">
        <section className="hero">
          <div className="label">Bu ekran açıldığından beri zincire yazılan işlem</div>
          <div className="counter mono">{txCount.toLocaleString("tr-TR")}</div>
          <div className="sub">
            <span className="mono">{tps.toFixed(1)}</span> tx/sn (son 10 sn) · blok başına rekor{" "}
            <span className="mono">{record}</span> · blok <span className="mono">#{head.toString()}</span>
          </div>
          <div className="bars" aria-hidden>
            {bars.map((b) => (
              <div key={b.n.toString()} className="bar" style={{ height: `${(b.count / maxBar) * 100}%` }} title={`#${b.n}: ${b.count}`}>
                {b.count > 0 && b.count === maxBar && <span>{b.count}</span>}
              </div>
            ))}
          </div>
          <div className="barlabel">Her çubuk bir Monad bloğu: o blokta düşen oy + tepki sayısı</div>
        </section>

        <section className="side">
          <div className="card">
            <div className="label">Kullanılan oy</div>
            <div className="big mono">
              {snap?.totalVotes ?? 0}
              <small> / {snap?.voterCount ?? 0}</small>
            </div>
            <div className="meter">
              <div style={{ width: `${turnout}%` }} />
            </div>
            <div className="dim">Sonuçlar oylama kapanana kadar gizli</div>
          </div>

          <div className="card">
            <div className="label">Alkış ölçer</div>
            <ul className="applause">
              {snap?.projects.map((p, i) => (
                <li key={i} className={stage === i ? "on" : ""}>
                  <span className="aname">{p.name}</span>
                  <span className="abar">
                    <span style={{ width: `${((reactsByProject[i] ?? 0) / maxReact) * 100}%` }} />
                  </span>
                  <span className="mono acount">{reactsByProject[i] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {onStage && (
        <div className="stage">
          <span className="label">Sahnede</span>
          <b>{onStage.name}</b>
          <span className="dim">{onStage.team}</span>
        </div>
      )}

      {phase === 2 && (
        <div className="stage cta">
          Oylama kapandı · sonuçlar için <kbd>R</kbd>
        </div>
      )}

      {error && !snap && <div className="stage err">RPC'ye bağlanılamıyor: {error}</div>}

      <div className="rain" aria-hidden>
        {rain.map((d) => (
          <span key={d.id} className="drop" style={{ left: `${d.x}%`, animationDuration: `${d.dur}s` }}>
            {d.emoji}
          </span>
        ))}
      </div>

      <footer className="keys dim">
        ← → sahnedeki proje · R sonuçlar · F tam ekran
      </footer>
    </div>
  );
}
