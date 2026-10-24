import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEventLogs, type Hex } from "viem";
import { blitzTypeAbi } from "./abi";
import {
  contract,
  encodeName,
  encodeWord,
  explorerTx,
  makeBlockClock,
  makeBurner,
  NAME_GAS_CEIL,
  publicClient,
  readState,
  readWords,
  shortErr,
  WORD_GAS_CEIL,
  type GameState,
} from "./chain";

type Result = { rank: number; blocks: number };

const pad = (est: bigint, ceil: bigint) => {
  const g = (est * 13n) / 10n;
  return g > ceil ? ceil : g;
};

export default function Play({ pk }: { pk: Hex }) {
  const burner = useMemo(() => makeBurner(pk), [pk]);
  const address = burner.account.address;
  const clock = useRef(makeBlockClock());
  const [st, setSt] = useState<GameState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const wordsRound = useRef(0);
  const [idx, setIdx] = useState(0); // words typed locally (optimistic)
  const [confirmed, setConfirmed] = useState(0); // words confirmed on-chain
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [latency, setLatency] = useState<{ secs: number; block: bigint; hash: string; sync: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [, setTick] = useState(0);
  const wordGas = useRef<bigint | null>(null);
  const inflight = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- polling
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    try {
      const s = await readState(address);
      clock.current.observe(s.blockNumber);
      setSt(s);
      setErr(null);
      if (s.round !== 0 && s.round !== wordsRound.current) {
        wordsRound.current = s.round;
        setWords(await readWords(s.round, s.startedAt));
        setIdx(s.myProgress);
        setConfirmed(s.myProgress);
        setResult(null);
        setLatency(null);
        setInput("");
      } else if (inflight.current === 0) {
        // nothing pending: trust the chain
        setConfirmed(s.myProgress);
        setIdx((i) => (i < s.myProgress ? s.myProgress : i));
      }
    } catch (e) {
      setErr(shortErr(e));
    }
  }, [address]);

  const phase = !st || st.round === 0
    ? "idle"
    : clock.current.now() < st.startBlock
      ? "countdown"
      : idx >= st.wordCount && st.wordCount > 0
        ? "finished"
        : clock.current.now() > st.endBlock
          ? "over"
          : "live";

  useEffect(() => {
    refresh();
    // fast polling only around the countdown; during the race the chain answers our own txs
    const ms = phase === "countdown" ? 1000 : phase === "live" ? 5000 : 2500;
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refresh, phase]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    publicClient.getBalance({ address }).then(setBalance).catch(() => {});
  }, [address, confirmed]);

  useEffect(() => {
    if (phase === "live") inputRef.current?.focus();
  }, [phase]);

  // ------------------------------------------------------------------ name
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || new TextEncoder().encode(n).length > 16) return;
    setSavingName(true);
    try {
      const est = await publicClient.estimateContractGas({ ...contract, functionName: "setName", args: [n], account: address });
      const { receipt } = await burner.sendAndConfirm(encodeName(n), pad(est, NAME_GAS_CEIL));
      if (receipt.status !== "success") throw new Error("İşlem geri döndü");
      setSt((s) => (s ? { ...s, myName: n } : s));
    } catch (e) {
      setErr(shortErr(e));
    } finally {
      setSavingName(false);
    }
  }

  // ------------------------------------------------------------------ words
  async function submit(word: string, wordIndex: number, isLast: boolean) {
    inflight.current++;
    try {
      if (wordGas.current === null) {
        // estimate only works with nothing pending; the first word is the most expensive non-final write
        const est = await publicClient.estimateContractGas({ ...contract, functionName: "typeWord", args: [word], account: address });
        wordGas.current = pad(est, WORD_GAS_CEIL);
      }
      const gas = isLast ? (wordGas.current + 90_000n > WORD_GAS_CEIL ? WORD_GAS_CEIL : wordGas.current + 90_000n) : wordGas.current;
      const t0 = performance.now();
      const { receipt, viaSync } = await burner.sendAndConfirm(encodeWord(word), gas);
      if (receipt.status !== "success") throw new Error("İşlem geri döndü (gas yetmedi mi?)");
      setConfirmed((c) => Math.max(c, wordIndex + 1));
      setLatency({ secs: (performance.now() - t0) / 1000, block: receipt.blockNumber, hash: receipt.transactionHash, sync: viaSync });
      const fin = parseEventLogs({ abi: blitzTypeAbi, logs: receipt.logs, eventName: "Finished" })[0];
      if (fin) setResult({ rank: Number(fin.args.rank), blocks: Number(fin.args.blocksTaken) });
    } catch (e) {
      setErr(shortErr(e));
      wordGas.current = null;
      // resync with the chain: the next word to type is whatever the contract says
      try {
        const s = await readState(address);
        setIdx(s.myProgress);
        setConfirmed(s.myProgress);
      } catch {
        /* next poll will fix it */
      }
    } finally {
      inflight.current--;
    }
  }

  function onType(v: string) {
    if (phase !== "live") return;
    const target = words[idx];
    if (!target) return;
    const clean = v.toLowerCase().replace(/\s+/g, " ").replace(/^ /, "");
    const typed = clean.trim();
    if (typed === target) {
      setInput("");
      setIdx(idx + 1);
      submit(target, idx, idx + 1 === words.length);
      return;
    }
    if (clean.endsWith(" ")) {
      // space on a wrong word: shake, keep the text without the space
      setShake(true);
      setTimeout(() => setShake(false), 300);
      setInput(typed);
      return;
    }
    setInput(clean);
  }

  // ------------------------------------------------------------------ render
  const ms = clock.current.msPerBlock();
  const now = clock.current.now();
  const countdownSecs = st ? Math.max(0, Math.ceil((Number(st.startBlock - now) * ms) / 1000)) : 0;
  const leftSecs = st ? Math.max(0, Math.ceil((Number(st.endBlock - now) * ms) / 1000)) : 0;
  const target = words[idx] ?? "";
  const ok = target.startsWith(input.trim());

  if (st && !st.myName) {
    return (
      <Shell round={st.round} label="Hoş geldin">
        <form className="namebox" onSubmit={saveName}>
          <h2>Adın ne?</h2>
          <p className="dim">Projektördeki yarış şeridinde bu görünecek. Bu da bir Monad işlemi.</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="ör. Obu"
            maxLength={16}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="primary" disabled={!name.trim() || savingName}>
            {savingName ? "Zincire yazılıyor…" : "Kaydet"}
          </button>
          {err && <p className="err">{err}</p>}
        </form>
      </Shell>
    );
  }

  return (
    <Shell round={st?.round ?? 0} label={st?.myName ?? "…"}>
      {phase === "idle" && (
        <div className="center">
          <h2>Yarış bekleniyor</h2>
          <p className="dim">Organizatör turu başlatınca kelimeler burada belirecek. Ekranı açık tut.</p>
        </div>
      )}

      {phase === "countdown" && (
        <div className="center">
          <div className="count mono">{countdownSecs}</div>
          <p className="dim">{st?.wordCount} kelime · her doğru kelime bir Monad işlemi</p>
        </div>
      )}

      {phase === "live" && (
        <section className="race">
          <div className="meta">
            <span className="mono">
              {idx}/{words.length}
            </span>
            <span className="mono dim">{leftSecs} sn</span>
          </div>
          <div className={`target${shake ? " shake" : ""}`}>
            <span className={ok ? "okp" : "badp"}>{target.slice(0, input.trim().length)}</span>
            <span>{target.slice(input.trim().length)}</span>
          </div>
          <div className="next dim">{words.slice(idx + 1, idx + 4).join("  ")}</div>
          <input
            ref={inputRef}
            className={`typein${ok ? "" : " wrong"}`}
            value={input}
            onChange={(e) => onType(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            inputMode="text"
            placeholder="buraya yaz…"
          />
          <Bars typed={idx} confirmed={confirmed} total={words.length} />
        </section>
      )}

      {phase === "finished" && (
        <div className="center">
          {result ? (
            <>
              <div className="rank mono">{result.rank}.</div>
              <h2>Bitirdin!</h2>
              <p className="dim">
                {result.blocks} blokta · sıra zincirde kesinleşti
              </p>
            </>
          ) : (
            <>
              <h2>Bitti, son kelimen zincire gidiyor…</h2>
              <Bars typed={idx} confirmed={confirmed} total={words.length} />
            </>
          )}
        </div>
      )}

      {phase === "over" && (
        <div className="center">
          <h2>Süre doldu</h2>
          <p className="dim">
            {confirmed}/{words.length} kelime zincirde. Sonraki tura hazır ol!
          </p>
        </div>
      )}

      {latency && (
        <a className="lat" href={explorerTx(latency.hash) || undefined} target="_blank" rel="noreferrer">
          son kelime {latency.secs.toFixed(2)} sn'de blokta · #{latency.block.toString()}
          {latency.sync ? " · tek istekte onay" : ""}
        </a>
      )}
      {err && (
        <div className="toast err" onClick={() => setErr(null)}>
          {err}
        </div>
      )}
      <footer className="me">
        <span className="mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <span className="mono">{balance === null ? "…" : Number(formatEther(balance)).toFixed(4)} MON</span>
      </footer>
    </Shell>
  );
}

function Bars({ typed, confirmed, total }: { typed: number; confirmed: number; total: number }) {
  const t = total ? (typed / total) * 100 : 0;
  const c = total ? (confirmed / total) * 100 : 0;
  return (
    <div className="bars2">
      <div className="lbl dim">
        <span>yazdın {typed}</span>
        <span>zincirde {confirmed}</span>
      </div>
      <div className="track">
        <div className="typed" style={{ width: `${t}%` }} />
        <div className="conf" style={{ width: `${c}%` }} />
      </div>
    </div>
  );
}

function Shell({ round, label, children }: { round: number; label: string; children: React.ReactNode }) {
  return (
    <div className="phone">
      <header className="vhead">
        <span className="brand">
          Blitz<span>Type</span>
        </span>
        <span className="pill">{round ? `Tur ${round}` : "—"} · {label}</span>
      </header>
      {children}
    </div>
  );
}

export function Landing() {
  return (
    <div className="phone">
      <header className="vhead">
        <span className="brand">
          Blitz<span>Type</span>
        </span>
      </header>
      <div className="center">
        <h2>Kartındaki QR'ı okut</h2>
        <p>Cüzdan ve gas hazır gelir. Tur başlayınca kelimeleri yaz; her doğru kelime bir Monad işlemi.</p>
        <a className="link" href="#/screen">
          Projektör ekranı →
        </a>
      </div>
    </div>
  );
}
