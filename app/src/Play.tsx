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
      setShake(true);
      setTimeout(() => setShake(false), 280);
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
  const typed = input.trim();
  const wrongAt = [...typed].findIndex((ch, i) => target[i] !== ch);

  const footer = (
    <footer className="pfoot">
      <span>
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <span>{balance === null ? "…" : Number(formatEther(balance)).toFixed(4)} MON</span>
    </footer>
  );

  if (st && !st.myName) {
    return (
      <Shell status={<span className="status">Kayıt</span>}>
        <form className="pbody" onSubmit={saveName}>
          <span className="kicker">Adım 1 / 1</span>
          <h1 className="headline">Projektörde adın ne yazsın?</h1>
          <p className="lede">Yarış tablosunda bu görünecek. Kaydetmek de bir Monad işlemi.</p>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="ör. Obu"
            maxLength={16}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Takma ad"
          />
          <button className="btn" disabled={!name.trim() || savingName}>
            {savingName ? "Zincire yazılıyor…" : "Kaydet"}
          </button>
          {err && <p className="err">{err}</p>}
        </form>
        {footer}
      </Shell>
    );
  }

  if (phase === "countdown") {
    return (
      <Shell status={<span className="status countdown">Tur {st?.round} · Hazır</span>}>
        <div className="takeover">
          <span className="kicker">Başlıyor</span>
          <div className="giant">{countdownSecs}</div>
          <span className="kicker">{st?.wordCount} kelime · her doğru kelime bir Monad işlemi</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      status={
        <span className={`status ${phase === "live" ? "live" : phase === "over" || phase === "finished" ? "over" : ""}`}>
          {phase === "idle" ? "Bekleniyor" : `Tur ${st?.round} · ${phase === "live" ? "Canlı" : "Bitti"}`}
        </span>
      }
    >
      <div className="pmeta">
        <span>{st?.myName ?? "…"}</span>
        {phase === "live" && (
          <span>
            {idx}/{words.length} · {leftSecs} sn
          </span>
        )}
      </div>

      <div className="pbody">
        {phase === "idle" && (
          <>
            <span className="kicker">Hazırsın, {st?.myName}</span>
            <h1 className="headline">Yarış başlayınca kelimeler burada belirecek</h1>
            <p className="lede">Ekranı açık tut. Geri sayım hem burada hem projektörde görünür.</p>
          </>
        )}

        {phase === "live" && (
          <>
            <div className={`keys${shake ? " shake" : ""}`} aria-label={`Yazılacak kelime: ${target}`}>
              {[...target].map((ch, i) => (
                <span
                  key={i}
                  className={`key${i < typed.length ? (wrongAt !== -1 && i >= wrongAt ? " miss" : " hit") : ""}`}
                >
                  {ch}
                </span>
              ))}
            </div>
            <div className="upnext">
              <b>{words[idx + 1] ?? ""}</b> {words.slice(idx + 2, idx + 4).join(" ")}
            </div>
            <input
              ref={inputRef}
              className={`field${wrongAt !== -1 ? " wrong" : ""}`}
              value={input}
              onChange={(e) => onType(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="yaz…"
              aria-label="Kelimeyi yaz"
            />
            <Segments total={words.length} typed={idx} confirmed={confirmed} />
          </>
        )}

        {phase === "finished" && (
          <div className="result">
            <span className="kicker">Bitiş · sıran</span>
            {result ? (
              <>
                <div className="pos">{result.rank}</div>
                <h1 className="headline">{result.blocks} blokta bitirdin</h1>
                <p className="lede">Sıran zincirde kesinleşti; projektörde de görünüyor.</p>
              </>
            ) : (
              <>
                <h1 className="headline">Son kelimen zincire gidiyor</h1>
                <Segments total={words.length} typed={idx} confirmed={confirmed} />
              </>
            )}
            <div className="chequer" aria-hidden />
          </div>
        )}

        {phase === "over" && (
          <>
            <span className="kicker">Süre doldu</span>
            <h1 className="headline">
              {confirmed}/{words.length} kelime zincirde
            </h1>
            <p className="lede">Sonraki tura hazır ol.</p>
            <Segments total={words.length} typed={idx} confirmed={confirmed} />
          </>
        )}

        {latency && (
          <a className="receipt" href={explorerTx(latency.hash) || undefined} target="_blank" rel="noreferrer">
            <span>
              son kelime <b>{latency.secs.toFixed(2)} sn</b>'de blokta
            </span>
            <span>
              #{latency.block.toString()}
              {latency.sync ? " · tek istek" : ""}
            </span>
          </a>
        )}
      </div>

      {err && (
        <div className="toast" role="alert" onClick={() => setErr(null)}>
          {err}
        </div>
      )}
      {footer}
    </Shell>
  );
}

function Segments({ total, typed, confirmed }: { total: number; typed: number; confirmed: number }) {
  return (
    <div className="segs">
      <div className="cells">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`cell${i < confirmed ? " conf" : i < typed ? " typed" : ""}`} />
        ))}
      </div>
      <div className="legend">
        <span>yazdın {typed}</span>
        <span className="c">zincirde {confirmed}</span>
      </div>
    </div>
  );
}

function Shell({ status, children }: { status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="phone">
      <header className="ptop">
        <span className="wordmark" lang="en">
          BlitzType<span className="cur" />
        </span>
        {status}
      </header>
      {children}
    </div>
  );
}

export function Landing() {
  return (
    <Shell status={<span className="onmonad" lang="en">on Monad</span>}>
      <div className="pbody">
        <span className="kicker">Oda boyu yazma yarışı</span>
        <h1 className="headline">Kartındaki QR'ı okut</h1>
        <p className="lede">Cüzdan ve gas hazır gelir. Tur başlayınca kelimeleri yaz; her doğru kelime bir Monad işlemi, sırayı zincir belirler.</p>
        <a className="btn" href="#/screen" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
          Projektör ekranı
        </a>
      </div>
    </Shell>
  );
}
