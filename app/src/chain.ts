import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  fallback,
  http,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blitzTypeAbi } from "./abi";
import deployment from "./deployment.json";

const env = import.meta.env;
const chainId = Number(env.VITE_CHAIN_ID || deployment.chainId);
const isMonadTestnet = chainId === 10143;

// Monad testnet public RPCs (docs.monad.xyz/developer-essentials/testnet):
//   QuickNode 50 rps (25 rps eth_call/estimateGas) · Ankr 300 req/10 s · Monad Foundation 20 rps, no batching.
// A room of phones on the same Wi-Fi shares one IP, so each device picks a random primary and falls back to the rest.
const MONAD_TESTNET_RPCS = [
  "https://testnet-rpc.monad.xyz",
  "https://rpc.ankr.com/monad_testnet",
  "https://rpc-testnet.monadinfra.com",
];
const NO_BATCH = ["monadinfra.com"];

function rpcList(): string[] {
  if (env.VITE_RPC_URLS) return String(env.VITE_RPC_URLS).split(",").map((s) => s.trim()).filter(Boolean);
  if (env.VITE_RPC_URL) return [String(env.VITE_RPC_URL)];
  if (isMonadTestnet) return MONAD_TESTNET_RPCS;
  return [deployment.rpcUrl];
}

const rpcs = rpcList();
const primary = Math.floor(Math.random() * rpcs.length);
const ordered = [...rpcs.slice(primary), ...rpcs.slice(0, primary)];

export const CONFIG = {
  address: (env.VITE_BLITZTYPE_ADDRESS || deployment.address) as Address,
  chainId,
  rpcs: ordered,
  deployBlock: BigInt(env.VITE_DEPLOY_BLOCK || deployment.deployBlock || 0),
  explorer: (env.VITE_EXPLORER_URL || (isMonadTestnet ? "https://testnet.monadvision.com" : "")) as string,
};

export const chain = defineChain({
  id: CONFIG.chainId,
  name: isMonadTestnet ? "Monad Testnet" : `Chain ${CONFIG.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ordered } },
  // canonical Multicall3 on Monad testnet → many reads collapse into one eth_call
  contracts: isMonadTestnet ? { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } : undefined,
});

const transport = fallback(
  ordered.map((url) => http(url, { batch: NO_BATCH.some((d) => url.includes(d)) ? false : { wait: 16 }, retryCount: 1 })),
  { retryCount: 1 }
);

export const publicClient = createPublicClient({
  chain,
  transport,
  pollingInterval: 300,
  batch: { multicall: isMonadTestnet ? { wait: 16 } : false },
});

export const contract = { address: CONFIG.address, abi: blitzTypeAbi } as const;

// Monad charges the gas LIMIT, not gas used — limits come from an estimate (+30%), capped here.
// Local: word ≈ 36k (first ≈ 53k, finishing ≈ 83k), setName ≈ 47k. Monad's cold-page pricing adds some.
export const WORD_GAS_CEIL = 160_000n;
export const NAME_GAS_CEIL = 160_000n;

export type GameState = {
  round: number;
  startedAt: bigint;
  startBlock: bigint;
  endBlock: bigint;
  wordCount: number;
  finishers: number;
  myProgress: number;
  myName: string;
  blockNumber: bigint;
};

export async function readState(player: Address): Promise<GameState> {
  const [round, startedAt, startBlock, endBlock, wordCount, finishers, myProgress, myName, blockNumber] =
    await publicClient.readContract({ ...contract, functionName: "state", args: [player] });
  return {
    round: Number(round),
    startedAt,
    startBlock,
    endBlock,
    wordCount: Number(wordCount),
    finishers: Number(finishers),
    myProgress: Number(myProgress),
    myName,
    blockNumber,
  };
}

/** The words of a round come from its RoundStarted event, emitted exactly at `startedAt`. */
export async function readWords(round: number, startedAt: bigint): Promise<string[]> {
  const logs = await publicClient.getContractEvents({
    ...contract,
    eventName: "RoundStarted",
    args: { round: BigInt(round) },
    fromBlock: startedAt,
    toBlock: startedAt,
  });
  const words = logs[0]?.args.words;
  return words ? [...words] : [];
}

export async function readEventName(): Promise<string> {
  return publicClient.readContract({ ...contract, functionName: "eventName" });
}

// ------------------------------------------------------------------ fees

let feeCache: { at: number; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null = null;
const PRIORITY = 2_000_000_000n; // 2 gwei

/** Base fee × 1.5 + tip. Kept low on purpose: the funding script budgets burners with the same formula. */
export async function getFees() {
  if (feeCache && Date.now() - feeCache.at < 30_000) return feeCache;
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const base = block.baseFeePerGas ?? 100_000_000_000n;
  feeCache = { at: Date.now(), maxFeePerGas: (base * 15n) / 10n + PRIORITY, maxPriorityFeePerGas: PRIORITY };
  return feeCache;
}

// ---------------------------------------------------------------- burner

const KEY_STORAGE = `blitztype:${CONFIG.chainId}:${CONFIG.address.toLowerCase()}:pk`;

export function loadKey(): Hex | null {
  try {
    const k = localStorage.getItem(KEY_STORAGE);
    return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null;
  } catch {
    return null;
  }
}

export function saveKey(pk: Hex) {
  try {
    localStorage.setItem(KEY_STORAGE, pk);
  } catch {
    /* private mode: key lives only in memory for this tab */
  }
}

let syncSupported: boolean | null = null; // null = not tried yet

function isMethodMissing(e: unknown) {
  const any = e as { code?: number; cause?: { code?: number }; message?: string };
  const code = any?.code ?? any?.cause?.code;
  return code === -32601 || /method not found|not supported|does not exist|unknown method/i.test(any?.message ?? "");
}

/**
 * Burner wallet that signs locally and talks to the RPC as little as possible:
 * nonce fetched once then tracked locally, fees cached, chain ID fixed — one request per transaction.
 * Votes go through eth_sendRawTransactionSync (Monad returns the receipt in the same call).
 */
export function makeBurner(pk: Hex) {
  const account = privateKeyToAccount(pk);
  let nonce: number | null = null;
  let chainTail: Promise<unknown> = Promise.resolve();

  async function nextNonce() {
    if (nonce === null) nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
    return nonce++;
  }

  async function sign(data: Hex, gas: bigint) {
    const fees = await getFees();
    return account.signTransaction({
      type: "eip1559",
      chainId: CONFIG.chainId,
      to: CONFIG.address,
      data,
      gas,
      nonce: await nextNonce(),
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      value: 0n,
    });
  }

  /** Serialised so nonces always leave in order, even when the user taps fast. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = chainTail.then(job, job);
    chainTail = run.catch(() => {});
    return run;
  }

  function onSendError(e: unknown): never {
    nonce = null; // whatever went wrong, re-read the pending nonce before the next tx so we never leave a gap
    throw e;
  }

  /** Waits for inclusion; returns the receipt and how it was obtained. */
  function sendAndConfirm(data: Hex, gas: bigint): Promise<{ receipt: TransactionReceipt; viaSync: boolean }> {
    return enqueue(async () => {
      const serializedTransaction = await sign(data, gas);
      try {
        if (syncSupported !== false) {
          try {
            const receipt = await publicClient.sendRawTransactionSync({ serializedTransaction, timeout: 10_000 });
            syncSupported = true;
            return { receipt, viaSync: true };
          } catch (e) {
            if (!isMethodMissing(e)) throw e;
            syncSupported = false;
          }
        }
        const hash = await publicClient.sendRawTransaction({ serializedTransaction });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 200 });
        return { receipt, viaSync: false };
      } catch (e) {
        return onSendError(e);
      }
    });
  }

  /** Fire-and-forget: resolves once the RPC accepted the tx (no receipt polling). */
  function sendOnly(data: Hex, gas: bigint): Promise<Hex> {
    return enqueue(async () => {
      try {
        return await publicClient.sendRawTransaction({ serializedTransaction: await sign(data, gas) });
      } catch (e) {
        return onSendError(e);
      }
    });
  }

  return { account, sendAndConfirm, sendOnly };
}

export type Burner = ReturnType<typeof makeBurner>;

export const encodeWord = (word: string) => encodeFunctionData({ abi: blitzTypeAbi, functionName: "typeWord", args: [word] });
export const encodeName = (name: string) => encodeFunctionData({ abi: blitzTypeAbi, functionName: "setName", args: [name] });

/** Last ~10 s of observed block heads → ms per block (Monad ≈ 300–400 ms). */
export function makeBlockClock() {
  const samples: { n: bigint; t: number }[] = [];
  return {
    observe(n: bigint) {
      const last = samples[samples.length - 1];
      if (!last || n > last.n) samples.push({ n, t: Date.now() });
      while (samples.length > 2 && Date.now() - samples[0].t > 10_000) samples.shift();
    },
    msPerBlock() {
      if (samples.length < 2) return 400;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const ms = (b.t - a.t) / Number(b.n - a.n);
      return ms > 50 && ms < 5000 ? ms : 400;
    },
    /** estimated current block right now, extrapolated from the last head */
    now() {
      const last = samples[samples.length - 1];
      if (!last) return 0n;
      return last.n + BigInt(Math.floor((Date.now() - last.t) / this.msPerBlock()));
    },
  };
}

export function explorerTx(hash: string) {
  return CONFIG.explorer ? `${CONFIG.explorer}/tx/${hash}` : "";
}

export function shortErr(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = any?.cause?.data?.errorName;
  const map: Record<string, string> = {
    WrongWord: "Kelime zincirdekiyle eşleşmedi.",
    NotStarted: "Tur henüz başlamadı.",
    RoundOver: "Süre doldu.",
    AlreadyFinished: "Bu turu zaten bitirdin.",
    BadName: "İsim 1–16 karakter olmalı.",
  };
  if (name && map[name]) return map[name];
  const msg = any?.shortMessage || any?.message || String(e);
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k];
  if (/insufficient funds|insufficient balance/i.test(msg)) return "Kartın gas bakiyesi bitti — görevliye söyle.";
  if (/429|rate limit|too many/i.test(msg)) return "Ağ şu an yoğun, birkaç saniye sonra tekrar dene.";
  return msg.split("\n")[0].slice(0, 140);
}
