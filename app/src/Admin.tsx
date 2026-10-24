import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { encodeDeployData, encodeFunctionData, formatEther, formatUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { blitzTypeAbi } from "./abi";
import { blitzTypeBytecode } from "./bytecode";
import {
  CONFIG,
  contract,
  encodeName,
  encodeWord,
  makeBurner,
  publicClient,
  readState,
  readWords,
  rememberContract,
  shortErr,
  type GameState,
} from "./chain";
import { pickWords } from "./words";

/**
 * Organizer panel: everything the event needs, from a phone browser.
 * The organizer key is generated here and never leaves this browser (localStorage).
 * Monad specifics handled here:
 *  - gas is charged on the LIMIT → every limit comes from estimateGas × 1.3
 *  - 10 MON reserve balance → value-carrying txs wait ≥ 2.5 s (3+ blocks) after the previous tx ("emptying" exception)
 */
const ORG_KEY = `blitztype:${CONFIG.chainId}:organizer`;
const CARDS_KEY = `blitztype:${CONFIG.chainId}:${CONFIG.address.toLowerCase()}:cards`;
const ZERO = "0x0000000000000000000000000000000000000000";
const EMPTYING_GAP_MS = 2500;
const BATCH = 40;
// expected per-tx gas used to budget cards (the app itself always uses live estimates)
const WORD_GAS = 65_000n;
const NAME_GAS = 90_000n;
const FINISH_GAS = 130_000n;

const pad = (g: bigint) => (g * 13n) / 10n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOrgKey(): Hex | null {
  try {
    const k = localStorage.getItem(ORG_KEY);
    return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null;
  } catch {
    return null;
  }
}

function appBase() {
  return `${location.origin}${location.pathname}`;
}

export default function Admin() {
  const [pk, setPk] = useState<Hex | null>(() => {
    const m = location.hash.match(/^#\/admin\/(0x[0-9a-fA-F]{64})/);
    if (m) {
      try {
        localStorage.setItem(ORG_KEY, m[1]);
      } catch {
        /* ignore */
      }
      history.replaceState(null, "", `${location.pathname}#/admin${CONFIG.address !== ZERO ? `?c=${CONFIG.address}` : ""}`);
      return m[1] as Hex;
    }
    return loadOrgKey();
  });
  const org = useMemo(() => (pk ? makeBurner(pk) : null), [pk]);
  const address = org?.account.address;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [baseFee, setBaseFee] = useState<bigint | null>(null);
  const [st, setSt] = useState<GameState | null>(null);
  const [organizerOk, setOrganizerOk] = useState<boolean | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const lastTx = useRef(0);

  const say = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString("tr-TR")}  ${m}`, ...l].slice(0, 40));

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [b, blk] = await Promise.all([publicClient.getBalance({ address }), publicClient.getBlock({ blockTag: "latest" })]);
      setBalance(b);
      setBaseFee(blk.baseFeePerGas ?? null);
      if (CONFIG.address !== ZERO) {
        const [s, o] = await Promise.all([
          readState(address),
          publicClient.readContract({ ...contract, functionName: "organizer" }),
        ]);
        setSt(s);
        setOrganizerOk(o.toLowerCase() === address.toLowerCase());
      }
    } catch (e) {
      say(`Okuma hatası: ${shortErr(e)}`);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  /** Space value-carrying txs so each qualifies for Monad's reserve-balance "emptying" exception. */
  async function gapForValue() {
    const wait = lastTx.current + EMPTYING_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
  }

  async function send(label: string, data: Hex, opts: { to?: Address | null; value?: bigint } = {}) {
    if (!org || !address) throw new Error("Organizatör cüzdanı yok");
    if (opts.value) await gapForValue();
    const est = await publicClient.estimateGas({
      account: address,
      ...(opts.to === null ? {} : { to: opts.to ?? CONFIG.address }),
      data,
      value: opts.value ?? 0n,
    });
    const { receipt } = await org.sendAndConfirm(data, pad(est), opts);
    lastTx.current = Date.now();
    if (receipt.status !== "success") throw new Error(`${label}: işlem revert oldu`);
    say(`${label} ✓ blok #${receipt.blockNumber}`);
    return receipt;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      say(`${label} hata: ${shortErr(e)}`);
    } finally {
      setBusy(null);
      refresh();
    }
  }

  // ----------------------------------------------------------------- deploy
  const [eventName, setEventName] = useState("Monad Blitz Ankara");
  const deploy = () =>
    run("Deploy", async () => {
      const data = encodeDeployData({ abi: blitzTypeAbi, bytecode: blitzTypeBytecode, args: [eventName.trim() || "BlitzType"] });
      const r = await send("Deploy", data, { to: null });
      if (!r.contractAddress) throw new Error("Kontrat adresi gelmedi");
      rememberContract(r.contractAddress);
      say(`Kontrat: ${r.contractAddress}`);
      location.hash = `#/admin?c=${r.contractAddress}`;
      location.reload();
    });

  // ------------------------------------------------------------------ cards
  const [players, setPlayers] = useState(40);
  const [rounds, setRounds] = useState(3);
  const [words, setWords] = useState(15);
  const price = baseFee !== null ? (baseFee * 15n) / 10n + 2_000_000_000n : null;
  const perPlayer =
    price !== null ? (price * (NAME_GAS + BigInt(rounds) * (BigInt(words - 1) * WORD_GAS + FINISH_GAS)) * 11n) / 10n : null;

  const cards = () =>
    run("Kartlar", async () => {
      if (perPlayer === null) throw new Error("Ücret bilgisi yok");
      const keys = Array.from({ length: players }, () => generatePrivateKey());
      const addrs = keys.map((k) => privateKeyToAccount(k).address);
      // save first: a failed tx must not lose keys
      const prev: Hex[] = JSON.parse(localStorage.getItem(CARDS_KEY) || "[]");
      localStorage.setItem(CARDS_KEY, JSON.stringify([...prev, ...keys]));
      for (let i = 0; i < addrs.length; i += BATCH) {
        const chunk = addrs.slice(i, i + BATCH);
        await send(`Fonlama ${i + chunk.length}/${addrs.length}`, encodeFunctionData({ abi: blitzTypeAbi, functionName: "fund", args: [chunk] }), {
          value: perPlayer * BigInt(chunk.length),
        });
      }
      await printCards(keys, prev.length);
    });

  async function printCards(keys: Hex[], offset = 0) {
    const imgs = await Promise.all(
      keys.map((k) => QRCode.toDataURL(`${appBase()}#/p/${k}?c=${CONFIG.address}`, { margin: 1, width: 360, errorCorrectionLevel: "M" }))
    );
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>BlitzType kartları</title><style>
@page{size:A4;margin:10mm}body{font-family:system-ui,sans-serif;margin:0;color:#111}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.c{border:1.5px solid #111;padding:4mm;text-align:center;break-inside:avoid}
.t{display:flex;justify-content:space-between;font:800 11pt system-ui;letter-spacing:.06em}.t span{color:#888;font-weight:600}
img{width:100%;max-width:46mm;display:block;margin:2mm auto}.h{font-size:8.5pt;color:#444}.a{font:7.5pt monospace;color:#999;margin-top:1mm}
.bar{height:3mm;background:#ffd400;margin:-4mm -4mm 3mm}
</style></head><body><div class="g">${keys
      .map(
        (k, i) =>
          `<div class="c"><div class="bar"></div><div class="t">BLITZTYPE<span>#${offset + i + 1}</span></div><img src="${imgs[i]}"/><div class="h">Okut · adını yaz · yarış başlayınca yaz</div><div class="a">${privateKeyToAccount(k).address.slice(0, 6)}…${privateKeyToAccount(k).address.slice(-4)}</div></div>`
      )
      .join("")}</div><script>setTimeout(()=>print(),400)</script></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = url;
      a.download = "blitztype-kartlar.html";
      a.click();
    }
    say(`${keys.length} kart hazır (yazdırma sayfası açıldı)`);
  }

  const reprint = () =>
    run("Yeniden yazdır", async () => {
      const all: Hex[] = JSON.parse(localStorage.getItem(CARDS_KEY) || "[]");
      if (!all.length) throw new Error("Bu tarayıcıda kart yok");
      await printCards(all);
    });

  // ------------------------------------------------------------------ round
  const [roundWords, setRoundWords] = useState(15);
  const [seconds, setSeconds] = useState(45);
  const [countdown, setCountdown] = useState(5);

  async function blockMs() {
    const head = await publicClient.getBlock({ blockTag: "latest" });
    const span = head.number > 50n ? 50n : head.number;
    if (span === 0n) return 400;
    const old = await publicClient.getBlock({ blockNumber: head.number - span });
    const ms = (Number(head.timestamp - old.timestamp) * 1000) / Number(span);
    return ms > 50 && ms < 15000 ? ms : 400;
  }

  const startRound = () =>
    run("Tur", async () => {
      const ms = await blockMs();
      const delay = BigInt(Math.max(1, Math.round((countdown * 1000) / ms)));
      const dur = BigInt(Math.max(1, Math.round((seconds * 1000) / ms)));
      const list = pickWords(roundWords);
      await send(`Tur başladı (${list.length} kelime, ~${Math.round(ms)} ms/blok)`, encodeFunctionData({
        abi: blitzTypeAbi,
        functionName: "startRound",
        args: [list, delay, dur],
      }));
    });

  const endRound = () =>
    run("Bitir", async () => {
      await send("Tur bitirildi", encodeFunctionData({ abi: blitzTypeAbi, functionName: "endRound" }));
    });

  // ------------------------------------------------------------------- bots
  const [bots, setBots] = useState(12);
  const botsRace = () =>
    run("Botlar", async () => {
      if (!st || st.round === 0) throw new Error("Önce tur başlat");
      if (price === null) throw new Error("Ücret bilgisi yok");
      const list = await readWords(st.round, st.startedAt);
      const keys = Array.from({ length: bots }, () => generatePrivateKey());
      const accts = keys.map((k) => privateKeyToAccount(k));
      const each = (price * (NAME_GAS + BigInt(list.length - 1) * WORD_GAS + FINISH_GAS) * 12n) / 10n;
      await send(`${bots} bot fonlandı`, encodeFunctionData({ abi: blitzTypeAbi, functionName: "fund", args: [accts.map((a) => a.address)] }), {
        value: each * BigInt(bots),
      });
      const burners = keys.map((k) => makeBurner(k));
      const nameGas = pad(
        await publicClient.estimateContractGas({ ...contract, functionName: "setName", args: ["bot-00"], account: accts[0].address })
      );
      await Promise.all(burners.map((b, i) => b.sendOnly(encodeName(`bot-${String(i + 1).padStart(2, "0")}`), nameGas)));
      // wait for the countdown to finish (block-based)
      for (;;) {
        const n = await publicClient.getBlockNumber({ cacheTime: 0 });
        if (n >= st.startBlock) break;
        await sleep(300);
      }
      await sleep(600);
      const wordGas = pad(
        await publicClient.estimateContractGas({ ...contract, functionName: "typeWord", args: [list[0]], account: accts[0].address })
      );
      say(`Botlar yazıyor (kelime gas limiti ${wordGas})`);
      const ms = await blockMs();
      const head = await publicClient.getBlockNumber({ cacheTime: 0 });
      const endAt = Date.now() + Number(st.endBlock - head) * ms;
      await Promise.all(
        burners.map(async (b) => {
          const wps = 0.9 + Math.random() * 1.6;
          for (let i = 0; i < list.length; i++) {
            await sleep((1000 / wps) * (0.6 + Math.random() * 0.8));
            if (Date.now() > endAt) return;
            const last = i === list.length - 1;
            try {
              await b.sendOnly(encodeWord(list[i]), last ? wordGas + 90_000n : wordGas);
            } catch {
              return;
            }
          }
        })
      );
      say("Botlar bitirdi");
    });

  // ----------------------------------------------------------------- render
  const newWallet = () => {
    const k = generatePrivateKey();
    try {
      localStorage.setItem(ORG_KEY, k);
    } catch {
      /* ignore */
    }
    setPk(k);
  };

  const now = st?.blockNumber ?? 0n;
  const roundLive = !!st && st.round > 0 && now <= st.endBlock;
  const screenUrl = `${appBase()}#/screen?c=${CONFIG.address}`;
  const lowReserve = balance !== null && balance < 10n * 10n ** 18n;

  return (
    <div className="phone admin">
      <header className="ptop">
        <span className="wordmark" lang="en">
          BlitzType<span className="cur" />
        </span>
        <span className="status">Organizatör</span>
      </header>

      {!pk ? (
        <section className="adm">
          <span className="kicker">Adım 1</span>
          <h1 className="headline">Organizatör cüzdanı</h1>
          <p className="lede">Bu tarayıcıda yeni bir cüzdan oluşturulur; anahtar cihazından çıkmaz. Sonra ona test MON gönderirsin.</p>
          <button className="btn" onClick={newWallet}>
            Cüzdan oluştur
          </button>
        </section>
      ) : (
        <>
          <section className="adm">
            <span className="kicker">Cüzdan</span>
            <div className="kv">
              <span>Adres</span>
              <button className="copy mono" onClick={() => navigator.clipboard?.writeText(address!)}>
                {address}
              </button>
            </div>
            <div className="kv">
              <span>Bakiye</span>
              <b className="mono">{balance === null ? "…" : `${Number(formatEther(balance)).toFixed(4)} MON`}</b>
            </div>
            <div className="kv">
              <span>Taban ücret</span>
              <span className="mono">{baseFee === null ? "…" : `${Number(formatUnits(baseFee, 9)).toFixed(1)} gwei`}</span>
            </div>
            <p className="note">
              MON al: <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">faucet.monad.xyz</a> ·{" "}
              <a href="https://blitz.devnads.com" target="_blank" rel="noreferrer">blitz.devnads.com</a> → bu adrese gönder.
              {lowReserve && " Bakiye 10 MON altında: Monad'ın rezerv kuralı yüzünden MON gönderen işlemler arasında birkaç saniye bekleniyor."}
            </p>
            <button className="link-btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Anahtarı gizle" : "Anahtarı yedekle (göster)"}
            </button>
            {showKey && <code className="keybox mono">{pk}</code>}
          </section>

          <section className="adm">
            <span className="kicker">Kontrat</span>
            {CONFIG.address === ZERO ? (
              <>
                <input className="field sm" value={eventName} onChange={(e) => setEventName(e.target.value)} aria-label="Etkinlik adı" />
                <button className="btn" disabled={!!busy || !balance} onClick={deploy}>
                  {busy === "Deploy" ? "Deploy ediliyor…" : "BlitzType'ı deploy et"}
                </button>
              </>
            ) : (
              <>
                <div className="kv">
                  <span>Adres</span>
                  <a className="mono" href={`${CONFIG.explorer}/address/${CONFIG.address}`} target="_blank" rel="noreferrer">
                    {CONFIG.address.slice(0, 10)}…{CONFIG.address.slice(-6)}
                  </a>
                </div>
                {organizerOk === false && <p className="err">Bu cüzdan bu kontratın organizatörü değil.</p>}
                <div className="kv">
                  <span>Projektör</span>
                  <button className="copy mono" onClick={() => navigator.clipboard?.writeText(screenUrl)}>
                    linki kopyala
                  </button>
                </div>
                <a className="link-btn" href={`#/screen?c=${CONFIG.address}`}>
                  Projektör ekranını aç →
                </a>
              </>
            )}
          </section>

          {CONFIG.address !== ZERO && (
            <>
              <section className="adm">
                <span className="kicker">Kartlar</span>
                <div className="grid3">
                  <label>
                    Kişi
                    <input className="field sm" type="number" min={1} value={players} onChange={(e) => setPlayers(+e.target.value || 1)} />
                  </label>
                  <label>
                    Tur
                    <input className="field sm" type="number" min={1} value={rounds} onChange={(e) => setRounds(+e.target.value || 1)} />
                  </label>
                  <label>
                    Kelime
                    <input className="field sm" type="number" min={2} max={32} value={words} onChange={(e) => setWords(+e.target.value || 2)} />
                  </label>
                </div>
                <p className="note">
                  Kart başı ≈ {perPlayer === null ? "…" : Number(formatEther(perPlayer)).toFixed(4)} MON · toplam ≈{" "}
                  {perPlayer === null ? "…" : Number(formatEther(perPlayer * BigInt(players))).toFixed(3)} MON
                </p>
                <button className="btn" disabled={!!busy} onClick={cards}>
                  {busy === "Kartlar" ? "Fonlanıyor…" : "Kartları üret, fonla, yazdır"}
                </button>
                <button className="link-btn" disabled={!!busy} onClick={reprint}>
                  Bu tarayıcıdaki kartları yeniden yazdır
                </button>
              </section>

              <section className="adm">
                <span className="kicker">Tur {st?.round ? `· şu an #${st.round}${roundLive ? " (açık)" : " (bitti)"}` : ""}</span>
                <div className="grid3">
                  <label>
                    Kelime
                    <input className="field sm" type="number" min={2} max={32} value={roundWords} onChange={(e) => setRoundWords(+e.target.value || 2)} />
                  </label>
                  <label>
                    Süre sn
                    <input className="field sm" type="number" min={10} value={seconds} onChange={(e) => setSeconds(+e.target.value || 10)} />
                  </label>
                  <label>
                    Geri sayım
                    <input className="field sm" type="number" min={1} value={countdown} onChange={(e) => setCountdown(+e.target.value || 1)} />
                  </label>
                </div>
                <button className="btn" disabled={!!busy || roundLive} onClick={startRound}>
                  {busy === "Tur" ? "Başlatılıyor…" : "Turu başlat"}
                </button>
                <button className="link-btn" disabled={!!busy || !roundLive} onClick={endRound}>
                  Turu şimdi bitir
                </button>
              </section>

              <section className="adm">
                <span className="kicker">Bot yarışçılar</span>
                <p className="note">Salon az ise ya da yük göstermek için: yeni cüzdanlar üretilir, fonlanır ve insan hızında yazar.</p>
                <div className="grid3">
                  <label>
                    Bot
                    <input className="field sm" type="number" min={1} max={40} value={bots} onChange={(e) => setBots(Math.min(40, +e.target.value || 1))} />
                  </label>
                </div>
                <button className="btn" disabled={!!busy || !roundLive} onClick={botsRace}>
                  {busy === "Botlar" ? "Botlar yarışıyor…" : "Botları yarıştır"}
                </button>
              </section>
            </>
          )}

          <section className="adm">
            <span className="kicker">Kayıt</span>
            <ol className="log mono">
              {busy && <li>{busy}…</li>}
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {!log.length && !busy && <li className="dim">Henüz işlem yok</li>}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
