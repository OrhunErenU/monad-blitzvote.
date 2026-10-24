// Generated from contracts/artifacts — BlitzType.sol
export const blitzTypeAbi = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_eventName",
        "type": "string"
      },
      {
        "internalType": "string[]",
        "name": "pool",
        "type": "string[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyFinished",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadName",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BadWords",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "FundingFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoRoom",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoSolo",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotHost",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotJoined",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOrganizer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotStarted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RoomFull",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RoomStarted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RoundLive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RoundOver",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongWord",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "round",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "rank",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "blocksTaken",
        "type": "uint256"
      }
    ],
    "name": "Finished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "players",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "each",
        "type": "uint256"
      }
    ],
    "name": "Funded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      }
    ],
    "name": "Named",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "room",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "host",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wordCount",
        "type": "uint256"
      }
    ],
    "name": "RoomCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "room",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "rank",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "blocksTaken",
        "type": "uint256"
      }
    ],
    "name": "RoomFinished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "room",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "RoomJoined",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "room",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "endBlock",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "name": "RoomStartedEv",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "room",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wordIndex",
        "type": "uint256"
      }
    ],
    "name": "RoomTyped",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "round",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "endBlock",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "string[]",
        "name": "words",
        "type": "string[]"
      }
    ],
    "name": "RoundStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "run",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "blocksTaken",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "personalBest",
        "type": "bool"
      }
    ],
    "name": "SoloFinished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "run",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "name": "SoloStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wordIndex",
        "type": "uint256"
      }
    ],
    "name": "SoloTyped",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "round",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wordIndex",
        "type": "uint256"
      }
    ],
    "name": "Typed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_NAME",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_ROOM_PLAYERS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_WORDS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SOLO_WORDS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TOP_N",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "wordCount",
        "type": "uint8"
      }
    ],
    "name": "createRoom",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentRound",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "endRound",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eventName",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "finisherAt",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "finisherCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "players",
        "type": "address[]"
      }
    ],
    "name": "fund",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getRoom",
    "outputs": [
      {
        "internalType": "address",
        "name": "host",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "endBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint8",
        "name": "wordCount",
        "type": "uint8"
      },
      {
        "internalType": "uint16",
        "name": "players",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "finishers",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "getRound",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "startedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "endBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "wordCount",
        "type": "uint32"
      },
      {
        "internalType": "uint256",
        "name": "finishers",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "joinRoom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastRoom",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "nameOf",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "organizer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxN",
        "type": "uint256"
      }
    ],
    "name": "podium",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "players",
        "type": "address[]"
      },
      {
        "internalType": "string[]",
        "name": "names",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "i",
        "type": "uint256"
      }
    ],
    "name": "poolHash",
    "outputs": [
      {
        "internalType": "bytes8",
        "name": "",
        "type": "bytes8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolSize",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "progressOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "roomBoard",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "players",
        "type": "address[]"
      },
      {
        "internalType": "string[]",
        "name": "names",
        "type": "string[]"
      },
      {
        "internalType": "uint16[]",
        "name": "done",
        "type": "uint16[]"
      },
      {
        "internalType": "uint16[]",
        "name": "rank",
        "type": "uint16[]"
      },
      {
        "internalType": "uint32[]",
        "name": "blocks",
        "type": "uint32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "roomWins",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      }
    ],
    "name": "setName",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "soloHistory",
    "outputs": [
      {
        "internalType": "uint32[]",
        "name": "",
        "type": "uint32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "soloState",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "done",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "runs",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "best",
        "type": "uint32"
      },
      {
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "soloTop",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "players",
        "type": "address[]"
      },
      {
        "internalType": "uint32[]",
        "name": "best",
        "type": "uint32[]"
      },
      {
        "internalType": "string[]",
        "name": "names",
        "type": "string[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "i",
        "type": "uint256"
      }
    ],
    "name": "soloWordIndex",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "delayBlocks",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "durationBlocks",
        "type": "uint64"
      }
    ],
    "name": "startRoom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string[]",
        "name": "words",
        "type": "string[]"
      },
      {
        "internalType": "uint64",
        "name": "delayBlocks",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "durationBlocks",
        "type": "uint64"
      }
    ],
    "name": "startRound",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "startSolo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "state",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "round",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "startedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "startBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "endBlock",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "wordCount",
        "type": "uint32"
      },
      {
        "internalType": "uint256",
        "name": "finishers",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "myProgress",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "myName",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "blockNumber",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "word",
        "type": "string"
      }
    ],
    "name": "typeRoom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "word",
        "type": "string"
      }
    ],
    "name": "typeSolo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "word",
        "type": "string"
      }
    ],
    "name": "typeWord",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
