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
import Solo from "./Solo";
import Room from "./Room";
import { Segments, Shell } from "./ui";

type Result = { rank: number; blocks: number };

const pad = (est: bigint, ceil: bigint) => {
  const g = (est * 13n) / 10n;
  return g > ceil ? ceil : g;
};

type Mode = "room" | "solo" | "race"; // race = organizer stage round (projector)

export default function Play({ pk, initialMode = "room" }: { pk: Hex; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
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
  const wordGas = useRef<Promise<bigint> | null>(null); // shared: never estimate while earlier words are unconfirmed
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
        wordGas.current = null;
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
    const ms = mode !== "race" ? 8000 : phase === "countdown" ? 1000 : phase === "live" ? 5000 : 2500;
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refresh, phase, mode]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    publicClient.getBalance({ address }).then(setBalance).catch(() => {});
  }, [address, confirmed]);

  useEffect(() => {
    if (phase === "live" && mode === "race") inputRef.current?.focus();
  }, [phase, mode]);

  // ------------------------------------------------------------------ name
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || new TextEncoder().encode(n).length > 16) return;
    setSavingName(true);
    try {
      const est = await publicClient.estimateContractGas({ ...contract, functionName: "setName", args: [n], account: address });
      const { receipt } = await burner.sendAndConfirm(encodeName(n), pad(est, NAME_GAS_CEIL));
      if (receipt.status !== "success") throw new Error("Transaction reverted");
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
        wordGas.current = publicClient
          .estimateContractGas({ ...contract, functionName: "typeWord", args: [word], account: address })
          .then((est) => pad(est, WORD_GAS_CEIL))
          .catch(() => 90_000n);
      }
      const base = await wordGas.current;
      const gas = isLast ? (base + 90_000n > WORD_GAS_CEIL ? WORD_GAS_CEIL : base + 90_000n) : base;
      const t0 = performance.now();
      const { receipt, viaSync } = await burner.sendAndConfirm(encodeWord(word), gas);
      if (receipt.status !== "success") throw new Error("Transaction reverted (out of gas?)");
      setConfirmed((c) => Math.max(c, wordIndex + 1));
      setLatency({ secs: (performance.now() - t0) / 1000, block: receipt.blockNumber, hash: receipt.transactionHash, sync: viaSync });
      const fin = parseEventLogs({ abi: blitzTypeAbi, logs: receipt.logs, eventName: "Finished" })[0];
      if (fin) setResult({ rank: Number(fin.args.rank), blocks: Number(fin.args.blocksTaken) });
    } catch (e) {
      setErr(shortErr(e));
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

  if (balance === 0n) {
    return (
      <Shell status={<span className="status">No gas</span>}>
        <div className="pbody">
          <span className="kicker">Your wallet is ready, but empty</span>
          <h1 className="headline">Send a little testnet MON to this address</h1>
          <p className="lede">Each word burns ~0.01 MON of gas; 0.5 MON lasts dozens of runs. Get MON at faucet.monad.xyz or blitz.devnads.com.</p>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(address)}>
            Copy address
          </button>
          <code className="addrbox">{address}</code>
          <button className="btn ghost" onClick={() => publicClient.getBalance({ address }).then(setBalance)}>
            Refresh balance
          </button>
        </div>
        {footer}
      </Shell>
    );
  }

  const roundOn = phase === "countdown" || phase === "live";
  const tabs = (
    <nav className={`tabs${roundOn || mode === "race" ? " t3" : ""}`} aria-label="Mode">
      <button className={mode === "room" ? "on" : ""} onClick={() => setMode("room")} lang="en">
        Online
      </button>
      <button className={mode === "solo" ? "on" : ""} onClick={() => setMode("solo")}>
        Solo
      </button>
      {(roundOn || mode === "race") && (
        <button className={mode === "race" ? "on" : ""} onClick={() => setMode("race")}>
          Stage{roundOn && mode !== "race" ? <i className="dot" aria-label="live" /> : null}
        </button>
      )}
    </nav>
  );

  if (st && !st.myName) {
    return (
      <Shell status={<span className="status">Sign up</span>}>
        <form className="pbody" onSubmit={saveName}>
          <span className="kicker">Step 1 / 1</span>
          <h1 className="headline">Pick a name</h1>
          <p className="lede">Shown in rooms, on the leaderboard and on the projector. Saving it is a Monad transaction too.</p>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="e.g. obu"
            maxLength={16}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Nickname"
          />
          <button className="btn" disabled={!name.trim() || savingName}>
            {savingName ? "Writing to chain…" : "Save"}
          </button>
          {err && <p className="err">{err}</p>}
        </form>
        {footer}
      </Shell>
    );
  }

  if (st && mode === "room") {
    return (
      <Shell status={<span className="status" lang="en">Online</span>}>
        {tabs}
        <Room burner={burner} name={st.myName} clock={clock.current} onErr={setErr} />
        {err && (
          <div className="toast" role="alert" onClick={() => setErr(null)}>
            {err}
          </div>
        )}
        {footer}
      </Shell>
    );
  }

  if (st && mode === "solo") {
    return (
      <Shell status={<span className="status">Solo</span>}>
        {tabs}
        <Solo burner={burner} name={st.myName} msPerBlock={() => clock.current.msPerBlock()} onErr={setErr} />
        {err && (
          <div className="toast" role="alert" onClick={() => setErr(null)}>
            {err}
          </div>
        )}
        {footer}
      </Shell>
    );
  }

  if (phase === "countdown") {
    return (
      <Shell status={<span className="status countdown">Round {st?.round} · Ready</span>}>
        <div className="takeover">
          <span className="kicker">Starting</span>
          <div className="giant">{countdownSecs}</div>
          <span className="kicker">{st?.wordCount} words · every correct word is a Monad transaction</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      status={
        <span className={`status ${phase === "live" ? "live" : phase === "over" || phase === "finished" ? "over" : ""}`}>
          {phase === "idle" ? "Waiting" : `Round ${st?.round} · ${phase === "live" ? "Live" : "Over"}`}
        </span>
      }
    >
      {phase !== "live" && tabs}
      <div className="pmeta">
        <span>{st?.myName ?? "…"}</span>
        {phase === "live" && (
          <span>
            {idx}/{words.length} · {leftSecs}s
          </span>
        )}
      </div>

      <div className="pbody">
        {phase === "idle" && (
          <>
            <span className="kicker">Ready, {st?.myName}</span>
            <h1 className="headline">Words appear here when the stage round starts</h1>
            <p className="lede">Keep this screen open. Meanwhile, play an online room; the tab lights up when the round starts.</p>
            <button className="btn ghost" onClick={() => setMode("room")}>
              Go to online rooms
            </button>
          </>
        )}

        {phase === "live" && (
          <>
            <div className={`keys${shake ? " shake" : ""}`} aria-label={`Word to type: ${target}`}>
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
              placeholder="type…"
              aria-label="Type the word"
            />
            <Segments total={words.length} typed={idx} confirmed={confirmed} />
          </>
        )}

        {phase === "finished" && (
          <div className="result">
            <span className="kicker">Finish · your place</span>
            {result ? (
              <>
                <div className="pos">{result.rank}</div>
                <h1 className="headline">Finished in {result.blocks} blocks</h1>
                <p className="lede">Your place is final on-chain and on the projector.</p>
              </>
            ) : (
              <>
                <h1 className="headline">Your last word is on its way</h1>
                <Segments total={words.length} typed={idx} confirmed={confirmed} />
              </>
            )}
            <div className="chequer" aria-hidden />
          </div>
        )}

        {phase === "over" && (
          <>
            <span className="kicker">Time's up</span>
            <h1 className="headline">
              {confirmed}/{words.length} words on-chain
            </h1>
            <p className="lede">Get ready for the next round.</p>
            <Segments total={words.length} typed={idx} confirmed={confirmed} />
          </>
        )}

        {latency && (
          <a className="receipt" href={explorerTx(latency.hash) || undefined} target="_blank" rel="noreferrer">
            <span>
              last word in a block in <b>{latency.secs.toFixed(2)}s</b>
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
