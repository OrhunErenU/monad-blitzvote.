// Copies the BlitzType ABI + bytecode into the app (run after compiling).
const fs = require("fs");
const path = require("path");
const a = require("../artifacts/contracts/BlitzType.sol/BlitzType.json");
const app = path.join(__dirname, "../../app/src");
fs.writeFileSync(path.join(app, "abi.ts"), `// Generated from contracts/artifacts — BlitzType.sol\nexport const blitzTypeAbi = ${JSON.stringify(a.abi, null, 2)} as const;\n`);
fs.writeFileSync(path.join(app, "bytecode.ts"), `// Generated from contracts/artifacts — BlitzType.sol (deployed from the organizer panel)\nexport const blitzTypeBytecode = "${a.bytecode}" as const;\n`);
console.log("abi.ts + bytecode.ts updated");
