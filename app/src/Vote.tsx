import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, type Hex } from "viem";
import {
  contract,
  EMOJIS,
  encodeReact,
  encodeVote,
  explorerTx,
  makeBurner,
  PHASES,
  publicClient,
  REACT_GAS_CEIL,
  shortErr,
  VOTE_GAS_CEIL,
  type Burner,
} from "./chain";

const MAX_REACTS_PER_SEC = 2; // keeps a full room under public-RPC rate limits; extra taps still animate
import { useSnapshot } from "./hooks";

type Me = { isVoter: boolean; teamPlusOne: number; votePlusOne: number; balance: bigint };
type Burst = { id: number; emoji: string; x: number };

function pad(est: bigint, ceil: bigint) {
  const g = (est * 13n) / 10n;
  return g > ceil ? ceil : g;
}

export default function Vote({ pk }: { pk: Hex }) {
  const burner: Burner = useMemo(() => makeBurner(pk), [pk]);
  const address = burner.account.address;
  const { snap, error } = useSnapshot(8000);
  const [me, setMe] = useState<Me | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [voting, setVoting] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string; link?: string } | null>(null);
  const [sent, setSent] = useState(0);
  const recentSends = useRef<number[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const reactGas = useRef<bigint | null>(null);
  const burstId = useRef(0);

  const refreshMe = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [isVoter, teamPlusOne, votePlusOne, balance] = await Promise.all([
        publicClient.readContract({ ...contract, functionName: "isVoter", args: [address] }),
        publicClient.readContract({ ...contract, functionName: "teamOf", args: [address] }),
        publicClient.readContract({ ...contract, functionName: "voteOf", args: [address] }),
        publicClient.getBalance({ address }),
      ]);
      setMe({ isVoter, teamPlusOne: Number(teamPlusOne), votePlusOne: Number(votePlusOne), balance });
    } catch {
      /* keep last known */
    }
  }, [address]);

  useEffect(() => {
    refreshMe();
    const id = setInterval(refreshMe, 30000);
    return () => clearInterval(id);
  }, [refreshMe]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.kind === "ok" ? 6000 : 4500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (armed === null) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const phase = snap?.phase ?? 0;
  const canVote = phase === 1 && me?.isVoter && me.votePlusOne === 0;

  async function doVote(pid: number) {
    if (armed !== pid) {
      setArmed(pid);
      return;
    }
    setArmed(null);
    setVoting(pid);
    try {
      // estimate first: a revert here carries the real reason (AlreadyVoted, OwnProject…)
      const est = await publicClient.estimateContractGas({
        ...contract,
        functionName: "vote",
        args: [BigInt(pid)],
        account: burner.account.address,
      });
      const gas = pad(est, VOTE_GAS_CEIL);
      const t0 = performance.now();
      const { receipt, viaSync } = await burner.sendAndConfirm(encodeVote(pid), gas);
      const secs = ((performance.now() - t0) / 1000).toFixed(2);
      if (receipt.status !== "success") throw new Error("İşlem geri döndü");
      setToast({
        kind: "ok",
        text: `Oyun zincirde ✓  ${secs} sn · blok #${receipt.blockNumber}${viaSync ? " · tek istekte onay" : ""}`,
        link: explorerTx(receipt.transactionHash),
      });
      await refreshMe();
    } catch (e) {
      setToast({ kind: "err", text: shortErr(e) });
    } finally {
      setVoting(null);
    }
  }

  async function doReact(pid: number, emoji: number) {
    const id = ++burstId.current;
    setBursts((b) => [...b.slice(-24), { id, emoji: EMOJIS[emoji], x: 10 + Math.random() * 80 }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1600);
    if (navigator.vibrate) navigator.vibrate(12);
    const now = Date.now();
    recentSends.current = recentSends.current.filter((t) => now - t < 1000);
    if (recentSends.current.length >= MAX_REACTS_PER_SEC) return; // animate only
    recentSends.current.push(now);
    setSent((n) => n + 1);
    try {
      if (reactGas.current === null) {
        const est = await publicClient.estimateContractGas({
          ...contract,
          functionName: "react",
          args: [BigInt(pid), emoji],
          account: burner.account.address,
        });
        reactGas.current = pad(est, REACT_GAS_CEIL);
      }
      await burner.sendOnly(encodeReact(pid, emoji), reactGas.current);
    } catch (e) {
      setSent((n) => n - 1);
      setToast({ kind: "err", text: shortErr(e) });
    }
  }

  if (me && !me.isVoter) {
    return (
      <Shell title={snap ? PHASES[phase] : "…"} phase={phase}>
        <div className="empty">
          <h2>Bu kart kayıtlı değil</h2>
          <p>QR kartını bir görevliye göster, yeni kart alabilirsin.</p>
          <code className="mono dim">{address}</code>
        </div>
      </Shell>
    );
  }

  const votedFor = me && me.votePlusOne > 0 ? snap?.projects[me.votePlusOne - 1] : undefined;

  return (
    <Shell title={snap ? PHASES[phase] : "Bağlanıyor…"} phase={phase}>
      <section className="status">
        {error && !snap && <p className="err">Ağa bağlanılamıyor: {error}</p>}
        {votedFor ? (
          <p>
            <span className="tick">✓</span> Oyunu <b>{votedFor.name}</b> projesine verdin. Alkışlamaya devam edebilirsin.
          </p>
        ) : phase === 0 ? (
          <p>Oylama henüz açılmadı. Demolar sırasında emojilere dokunarak alkışla, her dokunuş bir Monad işlemi.</p>
        ) : phase === 1 ? (
          <p>
            <b>Tek oy hakkın var.</b> Bir projenin <i>Oy ver</i> düğmesine dokun, onaylamak için bir kez daha dokun.
          </p>
        ) : (
          <p>Oylama kapandı. Sonuçlar ekranda açıklanıyor.</p>
        )}
      </section>

      <ul className="projects">
        {snap?.projects.map((p, i) => {
          const own = me?.teamPlusOne === i + 1;
          const mine = me?.votePlusOne === i + 1;
          return (
            <li key={i} className={`project${mine ? " mine" : ""}${own ? " own" : ""}`}>
              <div className="ptop">
                <div>
                  <div className="pname">{p.name}</div>
                  <div className="pteam">
                    {p.team}
                    {own && <span className="tag">Senin takımın</span>}
                    {mine && <span className="tag ok">Oyun burada</span>}
                  </div>
                </div>
                {canVote && !own && (
                  <button
                    className={`votebtn${armed === i ? " armed" : ""}`}
                    disabled={voting !== null}
                    onClick={() => doVote(i)}
                  >
                    {voting === i ? "Gönderiliyor…" : armed === i ? "Onayla" : "Oy ver"}
                  </button>
                )}
              </div>
              {phase !== 2 && (
                <div className="reacts">
                  {EMOJIS.map((em, ei) => (
                    <button key={ei} className="react" onClick={() => doReact(i, ei)} aria-label={`${p.name} ${em}`}>
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {!snap && !error && <li className="project skeleton" />}
      </ul>

      <footer className="me">
        <span className="mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <span>{sent} alkış zincire gönderildi</span>
        <span className="mono">{me ? Number(formatEther(me.balance)).toFixed(4) : "…"} MON</span>
      </footer>

      {bursts.map((b) => (
        <span key={b.id} className="burst" style={{ left: `${b.x}%` }}>
          {b.emoji}
        </span>
      ))}

      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          {toast.text}
          {toast.link && (
            <a href={toast.link} target="_blank" rel="noreferrer">
              Explorer'da gör
            </a>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, phase, children }: { title: string; phase: number; children: React.ReactNode }) {
  return (
    <div className="voter">
      <header className="vhead">
        <span className="brand">
          Blitz<span>Vote</span>
        </span>
        <span className={`pill p${phase}`}>{title}</span>
      </header>
      {children}
    </div>
  );
}

export function Landing() {
  return (
    <div className="voter">
      <header className="vhead">
        <span className="brand">
          Blitz<span>Vote</span>
        </span>
      </header>
      <div className="empty">
        <h2>Kartındaki QR'ı okut</h2>
        <p>Girişte verilen kartı telefon kamerasıyla okut. Cüzdan, gas, kayıt… hepsi hazır gelir.</p>
        <p className="dim">Bir kart = bir oy · sınırsız alkış · hepsi Monad üzerinde</p>
        <a className="link" href="#/screen">
          Projektör ekranı →
        </a>
      </div>
    </div>
  );
}
