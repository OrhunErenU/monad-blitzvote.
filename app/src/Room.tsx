import { useCallback, useEffect, useRef, useState } from "react";
import { parseEventLogs } from "viem";
import { blitzTypeAbi } from "./abi";
import {
  CONFIG,
  contract,
  encodeCreateRoom,
  encodeJoinRoom,
  encodeRoomWord,
  encodeStartRoom,
  explorerTx,
  publicClient,
  readRoom,
  shortErr,
  soloWords,
  type Burner,
  type RoomInfo,
  type RoomPlayer,
} from "./chain";
import { Segments } from "./ui";
import { SOLO_POOL } from "./words";

const GAS_CEIL = 300_000n;
const FALLBACK_WORD_GAS = 80_000n;
const COUNTDOWN_SECS = 6;
const RACE_SECS = 90;
const pad = (est: bigint, extra = 0n) => {
  const g = (est * 13n) / 10n + extra;
  return g > GAS_CEIL ? GAS_CEIL : g;
};

/** Code from a share link: …/#/?room=1001 */
function codeFromUrl(): string {
  const m = location.hash.match(/[?&]room=(\d+)/);
  return m ? m[1] : "";
}

/**
 * Online rooms: create → share the code → others join → host starts → everyone races live.
 * Room, players, words (drawn from the on-chain pool at start) and ranks all live in the contract.
 */
export default function Room({
  burner,
  name,
  clock,
  onErr,
}: {
  burner: Burner;
  name: string;
  clock: { observe(n: bigint): void; msPerBlock(): number; now(): bigint };
  onErr: (e: string) => void;
}) {
  const address = burner.account.address;
  const storeKey = `blitztype:${CONFIG.chainId}:${CONFIG.address.toLowerCase()}:${address}:room`;
  const [roomId, setRoomId] = useState<bigint | null>(() => {
    try {
      const v = localStorage.getItem(storeKey);
      return v ? BigInt(v) : null;
    } catch {
      return null;
    }
  });
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [board, setBoard] = useState<RoomPlayer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState(codeFromUrl);
  const [wordCount, setWordCount] = useState(15);
  const [words, setWords] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [latency, setLatency] = useState<{ secs: number; block: bigint; hash: string } | null>(null);
  const [, setTick] = useState(0);
  const wordGas = useRef<Promise<bigint> | null>(null);
  const pending = useRef<Promise<unknown>[]>([]);
  const seedRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const enter = useCallback(
    (id: bigint | null) => {
      try {
        if (id === null) localStorage.removeItem(storeKey);
        else localStorage.setItem(storeKey, id.toString());
      } catch {
        /* per-device convenience only */
      }
      setRoomId(id);
      setInfo(null);
      setBoard([]);
      setWords([]);
      setIdx(0);
      setConfirmed(0);
      setLatency(null);
      seedRef.current = "";
      wordGas.current = null;
      pending.current = [];
    },
    [storeKey]
  );

  const refresh = useCallback(async () => {
    if (roomId === null || document.hidden) return;
    try {
      const r = await readRoom(roomId);
      clock.observe(r.info.blockNumber);
      if (r.info.host === "0x0000000000000000000000000000000000000000") {
        enter(null);
        return;
      }
      setInfo(r.info);
      setBoard(r.board);
      const me = r.board.find((p) => p.player.toLowerCase() === address.toLowerCase());
      if (r.info.startBlock > 0n && r.info.seed !== seedRef.current) {
        seedRef.current = r.info.seed;
        setWords(soloWords(r.info.seed, SOLO_POOL, r.info.wordCount));
        setIdx(me?.done ?? 0);
        setConfirmed(me?.done ?? 0);
      } else if (me) {
        setConfirmed((c) => Math.max(c, me.done));
        setIdx((i) => Math.max(i, me.done));
      }
    } catch (e) {
      onErr(shortErr(e));
    }
  }, [roomId, address, clock, enter, onErr]);

  const now = clock.now();
  const phase: "none" | "lobby" | "countdown" | "live" | "over" =
    roomId === null
      ? "none"
      : !info || info.startBlock === 0n
        ? "lobby"
        : now < info.startBlock
          ? "countdown"
          : now > info.endBlock || (info.wordCount > 0 && board.length > 0 && board.every((p) => p.done >= info.wordCount))
            ? "over"
            : "live";

  useEffect(() => {
    refresh();
    const ms = phase === "countdown" ? 1000 : phase === "live" ? 1500 : phase === "lobby" ? 2000 : 6000;
    if (phase === "none") return;
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refresh, phase]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "live") inputRef.current?.focus();
  }, [phase]);

  async function tx(label: string, fn: string, data: `0x${string}`, args: readonly unknown[]) {
    setBusy(label);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const est = await publicClient.estimateContractGas({ ...contract, functionName: fn as any, args: args as any, account: address });
      const { receipt } = await burner.sendAndConfirm(data, pad(est, 20_000n));
      if (receipt.status !== "success") throw new Error("İşlem geri döndü");
      return receipt;
    } catch (e) {
      onErr(shortErr(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const r = await tx("Oda açılıyor…", "createRoom", encodeCreateRoom(wordCount), [wordCount]);
    const ev = r && parseEventLogs({ abi: blitzTypeAbi, logs: r.logs, eventName: "RoomCreated" })[0];
    if (ev) enter(ev.args.room);
  }

  async function join() {
    const id = BigInt(code.trim() || "0");
    if (!id) return;
    const r = await tx("Katılınıyor…", "joinRoom", encodeJoinRoom(id), [id]);
    if (r) enter(id);
  }

  async function start() {
    if (roomId === null) return;
    const ms = clock.msPerBlock();
    const delay = BigInt(Math.max(3, Math.ceil((COUNTDOWN_SECS * 1000) / ms)));
    const dur = BigInt(Math.ceil((RACE_SECS * 1000) / ms));
    const r = await tx("Başlatılıyor…", "startRoom", encodeStartRoom(roomId, delay, dur), [roomId, delay, dur]);
    if (r) refresh();
  }

  async function submit(word: string, i: number, isLast: boolean) {
    if (roomId === null) return;
    try {
      let gas: bigint;
      if (isLast) {
        await Promise.allSettled(pending.current);
        const est = await publicClient
          .estimateContractGas({ ...contract, functionName: "typeRoom", args: [roomId, word], account: address })
          .catch(() => 120_000n);
        gas = pad(est, 10_000n);
      } else {
        if (wordGas.current === null) {
          wordGas.current = publicClient
            .estimateContractGas({ ...contract, functionName: "typeRoom", args: [roomId, word], account: address })
            .then((e) => pad(e))
            .catch(() => FALLBACK_WORD_GAS);
        }
        gas = await wordGas.current;
      }
      const t = performance.now();
      const { receipt } = await burner.sendAndConfirm(encodeRoomWord(roomId, word), gas);
      if (receipt.status !== "success") throw new Error("İşlem geri döndü (gas yetmedi mi?)");
      setConfirmed((c) => Math.max(c, i + 1));
      setLatency({ secs: (performance.now() - t) / 1000, block: receipt.blockNumber, hash: receipt.transactionHash });
      if (isLast) refresh();
    } catch (e) {
      onErr(shortErr(e));
      refresh();
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

  const ms = clock.msPerBlock();
  const isHost = info?.host.toLowerCase() === address.toLowerCase();
  const target = words[idx] ?? "";
  const typed = input.trim();
  const wrongAt = [...typed].findIndex((ch, i) => target[i] !== ch);
  const countdown = info ? Math.max(0, Math.ceil((Number(info.startBlock - now) * ms) / 1000)) : 0;
  const left = info ? Math.max(0, Math.ceil((Number(info.endBlock - now) * ms) / 1000)) : 0;
  const shareUrl = roomId !== null ? `${location.origin}${location.pathname}#/?room=${roomId}` : "";
  const sorted = [...board].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    if (a.rank) return -1;
    if (b.rank) return 1;
    return b.done - a.done;
  });
  const me = board.find((p) => p.player.toLowerCase() === address.toLowerCase());

  if (phase === "none") {
    return (
      <div className="pbody">
        <span className="kicker">Oda · {name}</span>
        <h1 className="headline">Oda kur ya da koda katıl</h1>
        <p className="lede">Odayı açan kodu paylaşır, herkes katılınca başlatır. Oda, oyuncular, kelimeler ve sıralama kontratta.</p>

        <div className="roombox">
          <span className="kicker">Koda katıl</span>
          <div className="row2">
            <input
              className="field"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="ör. 1001"
              aria-label="Oda kodu"
            />
            <button className="btn" onClick={join} disabled={!code || !!busy}>
              Katıl
            </button>
          </div>
        </div>

        <div className="roombox">
          <span className="kicker">Yeni oda</span>
          <div className="seg3" role="radiogroup" aria-label="Kelime sayısı">
            {[10, 15, 20].map((n) => (
              <button key={n} className={wordCount === n ? "on" : ""} onClick={() => setWordCount(n)} role="radio" aria-checked={wordCount === n}>
                {n} kelime
              </button>
            ))}
          </div>
          <button className="btn" onClick={create} disabled={!!busy}>
            {busy ?? "Oda kur"}
          </button>
        </div>
        {busy && <p className="lede">{busy}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="pmeta">
        <span>Oda {roomId?.toString()}</span>
        <span>
          {phase === "live"
            ? `${idx}/${words.length} · ${left} sn`
            : phase === "lobby"
              ? `${board.length} oyuncu`
              : phase === "over"
                ? "bitti"
                : "hazır"}
        </span>
      </div>

      {phase === "countdown" ? (
        <div className="takeover">
          <span className="kicker">Başlıyor</span>
          <div className="giant">{countdown}</div>
          <span className="kicker">{info?.wordCount} kelime · her doğru kelime bir Monad işlemi</span>
        </div>
      ) : (
        <div className="pbody">
          {phase === "lobby" && (
            <>
              <span className="kicker">Oda kodu</span>
              <div className="roomcode" lang="en">
                {roomId?.toString()}
              </div>
              <button
                className="btn ghost"
                onClick={() => {
                  if (navigator.share) navigator.share({ title: "BlitzType", text: `Oda ${roomId}`, url: shareUrl }).catch(() => {});
                  else navigator.clipboard?.writeText(shareUrl);
                }}
              >
                Davet linkini paylaş
              </button>
              {isHost ? (
                <button className="btn" onClick={start} disabled={!!busy}>
                  {busy ?? `Yarışı başlat · ${board.length} oyuncu`}
                </button>
              ) : (
                <p className="lede">Oda sahibi başlatınca geri sayım burada çıkacak.</p>
              )}
            </>
          )}

          {phase === "live" && me && (
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

          {phase === "live" && me && idx >= words.length && words.length > 0 && (
            <p className="lede">{me.rank ? `Bitirdin: ${me.rank}. sıra, ${me.blocks} blok.` : "Son kelimen zincire gidiyor…"}</p>
          )}

          {phase === "over" && (
            <div className="result">
              <span className="kicker">Oda {roomId?.toString()} · sonuç</span>
              <div className="pos">{me?.rank || "–"}</div>
              <h1 className="headline">{me?.rank ? `${me.blocks} blokta bitirdin` : `${me?.done ?? 0}/${info?.wordCount} kelime`}</h1>
              <button className="btn" onClick={() => enter(null)}>
                Yeni oda
              </button>
            </div>
          )}

          <ol className="board roomboard" aria-label="Oyuncular">
            {sorted.map((p, i) => (
              <li key={p.player} className={p.player.toLowerCase() === address.toLowerCase() ? "me" : ""}>
                <span className="p">{phase === "lobby" ? i + 1 : p.rank || i + 1}</span>
                <span className="n">
                  {p.name}
                  {info && p.player.toLowerCase() === info.host.toLowerCase() ? " · host" : ""}
                </span>
                {phase === "lobby" ? (
                  <span className="s">hazır</span>
                ) : (
                  <span className="mini" aria-label={`${p.done}/${info?.wordCount}`}>
                    <i style={{ width: `${(p.done / Math.max(1, info?.wordCount ?? 1)) * 100}%` }} />
                  </span>
                )}
                <span className="b">{p.rank ? `${p.blocks} blok` : phase === "lobby" ? "" : `${p.done}/${info?.wordCount}`}</span>
              </li>
            ))}
          </ol>

          {latency && phase !== "lobby" && (
            <a className="receipt" href={explorerTx(latency.hash) || undefined} target="_blank" rel="noreferrer">
              <span>
                son kelime <b>{latency.secs.toFixed(2)} sn</b>'de blokta
              </span>
              <span>#{latency.block.toString()}</span>
            </a>
          )}

          {phase !== "live" && phase !== "over" && (
            <button className="btn ghost" onClick={() => enter(null)}>
              Odadan çık
            </button>
          )}
        </div>
      )}
    </>
  );
}
