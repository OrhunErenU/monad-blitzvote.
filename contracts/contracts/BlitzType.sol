// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlitzType — a room-scale typing race where every correct word is a Monad transaction
/// @notice The organizer starts a round with a list of words. Everyone in the room types them in order;
///         each word is submitted on-chain and checked against its hash, so nobody can skip words or fake
///         progress. Finish order is decided by consensus, not by a game server.
/// @dev Designed for Monad's optimistic parallel execution:
///      - the hot path (`typeWord`) only READS round data (written once at round start) and only WRITES the
///        caller's own progress slot, so two players never touch the same written state;
///      - the only shared write is the finisher counter, hit once per finishing player;
///      - round fields and word hashes live in one struct, so on Monad (MIP-8, 128-slot storage pages)
///        they are usually loaded as a single cold page.
contract BlitzType {
    uint256 public constant MAX_WORDS = 32;
    uint256 public constant MAX_NAME = 16;

    struct Round {
        uint64 startBlock; // first block in which typing is accepted
        uint64 endBlock; // last block in which typing is accepted
        uint64 startedAt; // block of the startRound tx (where RoundStarted with the words was emitted)
        uint32 wordCount;
        bytes32[32] hashes; // keccak256 of each word
    }

    address public immutable organizer;
    string public eventName;
    uint256 public currentRound; // 0 = no round yet

    mapping(uint256 => Round) private _rounds;
    /// round => number of players who finished (separate slot: never touched by non-finishers)
    mapping(uint256 => uint256) public finisherCount;
    /// round => rank (1-based) => player
    mapping(uint256 => mapping(uint256 => address)) public finisherAt;
    /// player => (round << 128) | wordsDone — one slot per player, reused across rounds
    mapping(address => uint256) private _progress;
    mapping(address => string) public nameOf;

    event RoundStarted(uint256 indexed round, uint64 startBlock, uint64 endBlock, string[] words);
    event Typed(uint256 indexed round, address indexed player, uint256 wordIndex);
    event Finished(uint256 indexed round, address indexed player, uint256 rank, uint256 blocksTaken);
    event Named(address indexed player, string name);
    event Funded(uint256 players, uint256 each);

    error NotOrganizer();
    error RoundLive();
    error BadWords();
    error NotStarted();
    error RoundOver();
    error WrongWord();
    error AlreadyFinished();
    error BadName();
    error FundingFailed(address player);

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    constructor(string memory _eventName) {
        organizer = msg.sender;
        eventName = _eventName;
    }

    // ------------------------------------------------------------- organizer

    /// @param words the words to type, in order (1..32)
    /// @param delayBlocks countdown before typing opens (words are public from this tx on)
    /// @param durationBlocks how many blocks typing stays open
    function startRound(string[] calldata words, uint64 delayBlocks, uint64 durationBlocks) external onlyOrganizer {
        if (currentRound != 0 && block.number <= _rounds[currentRound].endBlock) revert RoundLive();
        uint256 n = words.length;
        if (n == 0 || n > MAX_WORDS || durationBlocks == 0) revert BadWords();

        uint256 id = ++currentRound;
        Round storage r = _rounds[id];
        r.startedAt = uint64(block.number);
        r.startBlock = uint64(block.number) + delayBlocks;
        r.endBlock = r.startBlock + durationBlocks - 1;
        r.wordCount = uint32(n);
        for (uint256 i; i < n; ++i) {
            if (bytes(words[i]).length == 0) revert BadWords();
            r.hashes[i] = keccak256(bytes(words[i]));
        }
        emit RoundStarted(id, r.startBlock, r.endBlock, words);
    }

    /// @notice End the current round early (e.g. everyone finished).
    function endRound() external onlyOrganizer {
        Round storage r = _rounds[currentRound];
        if (block.number <= r.endBlock) r.endBlock = uint64(block.number);
    }

    /// @notice Split msg.value equally between player wallets as gas money (dust goes back).
    function fund(address[] calldata players) external payable onlyOrganizer {
        uint256 n = players.length;
        uint256 each = n == 0 ? 0 : msg.value / n;
        for (uint256 i; i < n; ++i) {
            (bool ok,) = players[i].call{value: each}("");
            if (!ok) revert FundingFailed(players[i]);
        }
        uint256 dust = msg.value - each * n;
        if (dust > 0) {
            (bool ok,) = organizer.call{value: dust}("");
            require(ok, "dust refund failed");
        }
        emit Funded(n, each);
    }

    // --------------------------------------------------------------- players

    function setName(string calldata name) external {
        uint256 len = bytes(name).length;
        if (len == 0 || len > MAX_NAME) revert BadName();
        nameOf[msg.sender] = name;
        emit Named(msg.sender, name);
    }

    /// @notice Submit the next word. Must match the round's word at the caller's current index.
    function typeWord(string calldata word) external {
        uint256 id = currentRound;
        Round storage r = _rounds[id];
        if (block.number < r.startBlock || id == 0) revert NotStarted();
        if (block.number > r.endBlock) revert RoundOver();

        uint256 p = _progress[msg.sender];
        uint256 done = (p >> 128) == id ? uint128(p) : 0;
        uint256 n = r.wordCount;
        if (done >= n) revert AlreadyFinished();
        if (keccak256(bytes(word)) != r.hashes[done]) revert WrongWord();

        unchecked {
            ++done;
        }
        _progress[msg.sender] = (id << 128) | done;
        emit Typed(id, msg.sender, done - 1);

        if (done == n) {
            uint256 rank = ++finisherCount[id];
            finisherAt[id][rank] = msg.sender;
            emit Finished(id, msg.sender, rank, block.number - r.startBlock + 1);
        }
    }

    // ------------------------------------------------------------------ views

    function getRound(uint256 id)
        external
        view
        returns (uint64 startedAt, uint64 startBlock, uint64 endBlock, uint32 wordCount, uint256 finishers)
    {
        Round storage r = _rounds[id];
        return (r.startedAt, r.startBlock, r.endBlock, r.wordCount, finisherCount[id]);
    }

    /// @notice Words done by `player` in round `id`.
    function progressOf(address player, uint256 id) public view returns (uint256) {
        uint256 p = _progress[player];
        return (p >> 128) == id ? uint128(p) : 0;
    }

    /// @notice Everything a client needs in one call.
    function state(address player)
        external
        view
        returns (
            uint256 round,
            uint64 startedAt,
            uint64 startBlock,
            uint64 endBlock,
            uint32 wordCount,
            uint256 finishers,
            uint256 myProgress,
            string memory myName,
            uint256 blockNumber
        )
    {
        round = currentRound;
        Round storage r = _rounds[round];
        startedAt = r.startedAt;
        startBlock = r.startBlock;
        endBlock = r.endBlock;
        wordCount = r.wordCount;
        finishers = finisherCount[round];
        myProgress = progressOf(player, round);
        myName = nameOf[player];
        blockNumber = block.number;
    }

    /// @notice Top finishers of a round, in order.
    function podium(uint256 id, uint256 maxN) external view returns (address[] memory players, string[] memory names) {
        uint256 n = finisherCount[id];
        if (n > maxN) n = maxN;
        players = new address[](n);
        names = new string[](n);
        for (uint256 i; i < n; ++i) {
            players[i] = finisherAt[id][i + 1];
            names[i] = nameOf[players[i]];
        }
    }
}
