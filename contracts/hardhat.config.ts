import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import path from "path";

const SOLC_VERSION = "0.8.28";

// Offline fallback: LOCAL_SOLCJS=1 compiles with the solc npm package instead of downloading
// the native compiler. Not needed on a normal laptop.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: any, _hre, runSuper) => {
  if (process.env.LOCAL_SOLCJS === "1" && args.solcVersion === SOLC_VERSION) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const solc = require("solc");
    return {
      compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: solc.version().replace(".Emscripten.clang", ""),
    };
  }
  return runSuper();
});

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 500 },
      evmVersion: "paris",
      metadata: { bytecodeHash: "ipfs" }, // Sourcify doğrulaması için gerekli
    },
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
      chainId: Number(process.env.MONAD_CHAIN_ID || 10143),
      accounts,
    },
  },
  // docs.monad.xyz/guides/verify-smart-contract/hardhat — MonadVision (Sourcify) anahtarsız çalışır,
  // Monadscan için ETHERSCAN_API_KEY gerekir.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
    browserUrl: "https://testnet.monadvision.com",
  },
  etherscan: {
    enabled: !!process.env.ETHERSCAN_API_KEY,
    apiKey: { monadTestnet: process.env.ETHERSCAN_API_KEY || "" },
    customChains: [
      {
        network: "monadTestnet",
        chainId: 10143,
        urls: { apiURL: "https://api.etherscan.io/v2/api?chainid=10143", browserURL: "https://testnet.monadscan.com" },
      },
    ],
  },
};

export default config;
