import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { blitzVoteAbi } from "./abi";
import deployment from "./deployment.json";

const env = import.meta.env;

export const CONFIG = {
  address: (env.VITE_BLITZVOTE_ADDRESS || deployment.address) as Address,
  rpcUrl: (env.VITE_RPC_URL || deployment.rpcUrl) as string,
  chainId: Number(env.VITE_CHAIN_ID || deployment.chainId),
  deployBlock: BigInt(env.VITE_DEPLOY_BLOCK || deployment.deployBlock || 0),
  explorer: (env.VITE_EXPLORER_URL ||
    (Number(env.VITE_CHAIN_ID || deployment.chainId) === 10143 ? "https://testnet.monadexplorer.com" : "")) as string,
};

export const chain = defineChain({
  id: CONFIG.chainId,
  name: CONFIG.chainId === 10143 ? "Monad Testnet" : `Chain ${CONFIG.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
});

export const publicClient = createPublicClient({
  chain,
  transport: http(CONFIG.rpcUrl, { batch: { wait: 16 } }),
  pollingInterval: 250,
});

export const contract = { address: CONFIG.address, abi: blitzVoteAbi } as const;

export const PHASES = ["Hazırlık", "Oylama açık", "Oylama kapandı"] as const;
export type Phase = 0 | 1 | 2;

export const EMOJIS = ["👏", "🔥", "🚀", "💜"] as const;

// Monad charges the gas LIMIT, not gas used — keep limits tight but safe.
// Local measurements: vote ≈ 99k, react ≈ 30k. Estimates are padded 30%; these are ceilings/fallbacks.
export const VOTE_GAS_CEIL = 250_000n;
export const REACT_GAS_CEIL = 80_000n;

export type Project = { name: string; team: string };
export type Snapshot = {
  phase: Phase;
  voterCount: number;
  totalVotes: number;
  projects: Project[];
  votes: number[];
};

export async function readSnapshot(): Promise<Snapshot> {
  const [phase, voterCount, total, projects, votes] = await publicClient.readContract({
    ...contract,
    functionName: "snapshot",
  });
  return {
    phase: Number(phase) as Phase,
    voterCount: Number(voterCount),
    totalVotes: Number(total),
    projects: projects.map((p) => ({ name: p.name, team: p.team })),
    votes: votes.map(Number),
  };
}

export async function readEventName(): Promise<string> {
  return publicClient.readContract({ ...contract, functionName: "eventName" });
}

// ------------------------------------------------------------------ burner

const KEY_STORAGE = `blitzvote:${CONFIG.chainId}:${CONFIG.address.toLowerCase()}:pk`;

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

export function makeBurner(pk: Hex) {
  const account = privateKeyToAccount(pk, { nonceManager });
  const wallet = createWalletClient({ account, chain, transport: http(CONFIG.rpcUrl) });
  return { account, wallet };
}

export type Burner = ReturnType<typeof makeBurner>;

export function explorerTx(hash: string) {
  return CONFIG.explorer ? `${CONFIG.explorer}/tx/${hash}` : "";
}

export function shortErr(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = any?.cause?.data?.errorName;
  const map: Record<string, string> = {
    AlreadyVoted: "Bu kartla zaten oy verildi.",
    OwnProject: "Kendi projene oy veremezsin.",
    NotVoter: "Bu kart kayıtlı değil.",
    WrongPhase: "Oylama şu an açık değil.",
    UnknownProject: "Proje bulunamadı.",
  };
  if (name && map[name]) return map[name];
  const msg = any?.shortMessage || any?.message || String(e);
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k];
  if (/insufficient funds/i.test(msg)) return "Kartın gas bakiyesi bitti — görevliye söyle.";
  return msg.split("\n")[0].slice(0, 140);
}
