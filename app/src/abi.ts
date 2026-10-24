// Generated from contracts/artifacts — BlitzVote.sol
export const blitzVoteAbi = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_eventName",
        "type": "string"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyVoted",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "voter",
        "type": "address"
      }
    ],
    "name": "FundingFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotOrganizer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotVoter",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OwnProject",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnknownProject",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongPhase",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "enum BlitzVote.Phase",
        "name": "phase",
        "type": "uint8"
      }
    ],
    "name": "PhaseChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "projectId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "team",
        "type": "string"
      }
    ],
    "name": "ProjectAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "voter",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "projectId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "emoji",
        "type": "uint8"
      }
    ],
    "name": "Reacted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "voter",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "projectId",
        "type": "uint256"
      }
    ],
    "name": "Voted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "count",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "teamProjectId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fundingPerVoter",
        "type": "uint256"
      }
    ],
    "name": "VotersRegistered",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "SHARDS",
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
        "internalType": "string[]",
        "name": "names",
        "type": "string[]"
      },
      {
        "internalType": "string[]",
        "name": "teams",
        "type": "string[]"
      }
    ],
    "name": "addProjects",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "closeVoting",
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
    "inputs": [],
    "name": "getProjects",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "team",
            "type": "string"
          }
        ],
        "internalType": "struct BlitzVote.Project[]",
        "name": "",
        "type": "tuple[]"
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
    "name": "isVoter",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "openVoting",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "inputs": [],
    "name": "phase",
    "outputs": [
      {
        "internalType": "enum BlitzVote.Phase",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "projectCount",
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
        "name": "projectId",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "emoji",
        "type": "uint8"
      }
    ],
    "name": "react",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "voters",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "teamProjectIdPlusOne",
        "type": "uint256"
      }
    ],
    "name": "registerVoters",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "snapshot",
    "outputs": [
      {
        "internalType": "enum BlitzVote.Phase",
        "name": "_phase",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "_voterCount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_totalVotesCast",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "team",
            "type": "string"
          }
        ],
        "internalType": "struct BlitzVote.Project[]",
        "name": "projects",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256[]",
        "name": "votes",
        "type": "uint256[]"
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
    "name": "teamOf",
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
    "name": "totalVotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "sum",
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
        "name": "projectId",
        "type": "uint256"
      }
    ],
    "name": "vote",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "voteOf",
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
    "name": "voterCount",
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
        "name": "projectId",
        "type": "uint256"
      }
    ],
    "name": "votesFor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "sum",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
