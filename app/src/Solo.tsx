import { useCallback, useEffect, useRef, useState } from "react";
import { parseEventLogs, type Address } from "viem";
import { blitzTypeAbi } from "./abi";
import {
  contract,
  encodeSoloWord,
  encodeStartSolo,
  explorerTx,
  publicClient,
  readSolo,
  readSoloTop,
  shortErr,
  soloWords,
  type Burner,
  type SoloEntry,
} from "./chain";
import { Segments } from "./ui";
import { SOLO_POOL } from "./words";

export const SOLO_WORDS = 15;
const START_GAS_CEIL = 200_000n;
const WORD_GAS_CEIL = 160_000n;
const LAST_GAS_CEIL = 600_000n; // personal best can shift the on-chain top 10
const RESUME_BLOCKS = 1500n; // ~10 min: older unfinished runs are not resumed

const pad = (est: bigint, ceil: bigint, extra = 0n) => {
  const g = (est * 13n) / 10n + extra;
  return g > ceil ? ceil : g;
};

type Phase = "ready" | "starting" | "live" | "done";
type Done = { blocks: number; pb: boolean; wpm: number | null; secs: number | null };

/** Monkeytype-style personal test: 15 words picked on-chain, every correct word is a Monad tx. */
export default function Solo({
  burner,
  name,
  msPerBlock,
  onErr,
}: {
  burner: Burner;
  name: string;
  msPerBlock: () => number;
  onErr: (e: string) => void;
}) {
  const address = burner.account.address;
  const [phase, setPhase] = useState<Phase>("ready");
  const [words, setWords] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [best, setBest] = useState(0);
  const [runs, setRuns] = useState(0);
  const [top, setTop] = useState<SoloEntry[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [latency, setLatency] = useState<{ secs: number; block: bigint; hash: string } | null>(null);
  const t0 = useRef(0); // local clock when the words appeared
  const tTyped = useRef(0); // local clock when the last word was typed
  const wordGas = useRef<bigint | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBoard = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([readSolo(address), readSoloTop()]);
      setBest(s.best);
      setRuns(s.runs);
      setTop(t);
      return s;
    } catch (e) {
      onErr(shortErr(e));
      return null;
    }
  }, [address, onErr]);

  // on open: resume an unfinished recent run, otherwise show the board
  useEffect(() => {
    loadBoard().then((s) => {
      if (s && s.startBlock > 0n && s.done < SOLO_WORDS && s.blockNumber - s.startBlock < RESUME_BLOCKS) {
        setWords(soloWords(s.seed, SOLO_POOL, SOLO_WORDS));
        setIdx(s.done);
        setConfirmed(s.done);
        t0.current = performance.now();
        setPhase("live");
      }
    });
  }, [loadBoard]);

  useEffect(() => {
    if (phase !== "ready" && phase !== "done") return;
    const id = setInterval(() => !document.hidden && readSoloTop().then(setTop).catch(() => {}), 6000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "live") inputRef.current?.focus();
  }, [phase]);

  async function start() {
    setPhase("starting");
    setDone(null);
    setLatency(null);
    setInput("");
    try {
      const est = await publicClient.estimateContractGas({ ...contract, functionName: "startSolo", account: address });
      const { receipt } = await burner.sendAndConfirm(encodeStartSolo(), pad(est, START_GAS_CEIL));
      if (receipt.status !== "success") throw new Error("İşlem geri döndü");
      const ev = parseEventLogs({ abi: blitzTypeAbi, logs: receipt.logs, eventName: "SoloStarted" })[0];
      if (!ev) throw new Error("SoloStarted olayı yok");
      setWords(soloWords(ev.args.seed, SOLO_POOL, SOLO_WORDS));
      setRuns(Number(ev.args.run));
      setIdx(0);
      setConfirmed(0);
      pending.current = [];
      t0.current = performance.now();
      setPhase("live");
    } catch (e) {
      onErr(shortErr(e));
      setPhase("ready");
    }
  }

  async function submit(word: string, i: number, isLast: boolean) {
    try {
      let gas: bigint;
      if (isLast) {
        // the finishing word may write the shared top 10: estimate it with every earlier word confirmed
        await Promise.allSettled(pending.current);
        const est = await publicClient.estimateContractGas({ ...contract, functionName: "typeSolo", args: [word], account: address });
        gas = pad(est, LAST_GAS_CEIL, 10_000n);
      } else {
        if (wordGas.current === null) {
          const est = await publicClient.estimateContractGas({ ...contract, functionName: "typeSolo", args: [word], account: address });
          wordGas.current = pad(est, WORD_GAS_CEIL);
        }
        gas = wordGas.current;
      }
      const t = performance.now();
      const { receipt } = await burner.sendAndConfirm(encodeSoloWord(word), gas);
      if (receipt.status !== "success") throw new Error("İşlem geri döndü (gas yetmedi mi?)");
      setConfirmed((c) => Math.max(c, i + 1));
      setLatency({ secs: (performance.now() - t) / 1000, block: receipt.blockNumber, hash: receipt.transactionHash });
      const fin = parseEventLogs({ abi: blitzTypeAbi, logs: receipt.logs, eventName: "SoloFinished" })[0];
      if (fin) {
        const secs = (tTyped.current - t0.current) / 1000;
        const chars = words.reduce((n, w) => n + w.length, 0) + words.length - 1;
        setDone({
          blocks: Number(fin.args.blocksTaken),
          pb: fin.args.personalBest,
          secs: secs > 0 ? secs : null,
          wpm: secs > 0 ? Math.round(chars / 5 / (secs / 60)) : null,
        });
        setPhase("done");
        loadBoard();
      }
    } catch (e) {
      onErr(shortErr(e));
      wordGas.current = null;
      try {
        const s = await readSolo(address);
        setIdx(s.done);
        setConfirmed(s.done);
      } catch {
        /* keep local state */
      }
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
      const isLast = idx + 1 === words.length;
      if (isLast) tTyped.current = performance.now();
      const p = submit(target, idx, isLast);
      if (!isLast) pending.current.push(p);
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

  const ms = msPerBlock();
  const target = words[idx] ?? "";
  const typed = input.trim();
  const wrongAt = [...typed].findIndex((ch, i) => target[i] !== ch);
  const elapsed = phase === "live" ? Math.floor((performance.now() - t0.current) / 1000) : 0;

  return (
    <>
      <div className="pmeta">
        <span>{name}</span>
        <span>
          {phase === "live" ? `${idx}/${SOLO_WORDS} · ${elapsed} sn` : best ? `rekorun ${best} blok` : `${SOLO_WORDS} kelime`}
        </span>
      </div>

      <div className="pbody">
        {(phase === "ready" || phase === "starting") && (
          <>
            <span className="kicker">Bireysel test · {SOLO_WORDS} kelime</span>
            <h1 className="headline">
              {best ? (
                <>
                  Rekorun <b className="num">{best}</b> blok · ≈{((best * ms) / 1000).toFixed(1)} sn
                </>
              ) : (
                "Kelimeleri zincir seçer, süreni zincir tutar"
              )}
            </h1>
            <p className="lede">
              Başlayınca kontrat sana {SOLO_WORDS} kelime çeker. Her doğru kelime bir işlem; skorun, başlangıçtan son kelimeye kadar geçen
              blok sayısı.
            </p>
            <button className="btn" onClick={start} disabled={phase === "starting"}>
              {phase === "starting" ? "Kelimeler çekiliyor…" : runs ? "Tekrar dene" : "Başla"}
            </button>
          </>
        )}

        {phase === "live" && (
          <>
            <div className={`keys${shake ? " shake" : ""}`} aria-label={`Yazılacak kelime: ${target}`}>
              {[...target].map((ch, i) => (
                <span key={i} className={`key${i < typed.length ? (wrongAt !== -1 && i >= wrongAt ? " miss" : " hit") : ""}`}>
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

        {phase === "done" && done && (
          <div className="result">
            <span className="kicker">{done.pb ? "Yeni kişisel rekor" : "Bitti"}</span>
            <div className="pos">{done.blocks}</div>
            <h1 className="headline">
              blok · ≈{((done.blocks * ms) / 1000).toFixed(1)} sn{done.wpm ? ` · ${done.wpm} WPM` : ""}
            </h1>
            <p className="lede">Skor zincirde: {SOLO_WORDS} kelimenin hepsi kontrat tarafından doğrulandı.</p>
            <button className="btn" onClick={start}>
              Tekrar dene
            </button>
          </div>
        )}

        {latency && phase !== "ready" && (
          <a className="receipt" href={explorerTx(latency.hash) || undefined} target="_blank" rel="noreferrer">
            <span>
              son kelime <b>{latency.secs.toFixed(2)} sn</b>'de blokta
            </span>
            <span>#{latency.block.toString()}</span>
          </a>
        )}

        {phase !== "live" && <Board top={top} me={address} ms={ms} />}
      </div>
    </>
  );
}

export function Board({ top, me, ms }: { top: SoloEntry[]; me?: Address; ms: number }) {
  if (top.length === 0) return <p className="lede board-empty">Henüz rekor yok. İlk sen ol.</p>;
  return (
    <ol className="board" aria-label="Bireysel rekorlar">
      {top.map((t, i) => (
        <li key={t.player} className={t.player === me ? "me" : ""}>
          <span className="p">{i + 1}</span>
          <span className="n">{t.name}</span>
          <span className="b">{t.best} blok</span>
          <span className="s">≈{((t.best * ms) / 1000).toFixed(1)} sn</span>
        </li>
      ))}
    </ol>
  );
}
