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

    // ------------------------------------------------------------ solo mode
    /// Words per solo run (Monkeytype-style "words" test, same for everyone so scores compare).
    uint256 public constant SOLO_WORDS = 15;
    uint256 public constant TOP_N = 10;

    struct Solo {
        bytes32 seed; // picks this run's words from the pool
        uint64 startBlock; // block of the startSolo tx; words are accepted from the next block
        uint32 done;
        uint32 runs;
        uint32 best; // fewest blocks for SOLO_WORDS words, 0 = never finished
    }

    /// keccak256(word) truncated to 8 bytes; Solidity packs 4 per storage slot
    bytes8[] private _pool;
    mapping(address => Solo) private _solo;
    /// best solo players, sorted by `best` ascending (ties: earlier record first)
    address[] private _top;
    /// every finished solo run of a player, in blocks (personal history)
    mapping(address => uint32[]) private _soloHistory;

    // ---------------------------------------------------------------- rooms
    /// Anyone can open a room; others join with its code; the host starts it; words come from the pool.
    uint256 public constant MAX_ROOM_PLAYERS = 64;

    struct Room {
        address host;
        bytes32 seed; // set at start: picks the room's words from the pool
        uint64 startBlock; // 0 = lobby (not started)
        uint64 endBlock;
        uint8 wordCount;
        uint16 players;
        uint16 finishers;
    }

    uint256 public lastRoom = 1000; // room codes start at 1001
    mapping(uint256 => Room) private _rooms;
    mapping(uint256 => address[]) private _roomPlayers;
    /// room => player => done | rank << 16 | blocksTaken << 32 | joined << 255
    mapping(uint256 => mapping(address => uint256)) private _roomProg;
    /// online rooms won (rank 1) per player
    mapping(address => uint32) public roomWins;

    event RoundStarted(uint256 indexed round, uint64 startBlock, uint64 endBlock, string[] words);
    event Typed(uint256 indexed round, address indexed player, uint256 wordIndex);
    event Finished(uint256 indexed round, address indexed player, uint256 rank, uint256 blocksTaken);
    event Named(address indexed player, string name);
    event Funded(uint256 players, uint256 each);
    event SoloStarted(address indexed player, uint256 run, bytes32 seed);
    event SoloTyped(address indexed player, uint256 wordIndex);
    event SoloFinished(address indexed player, uint256 run, uint256 blocksTaken, bool personalBest);
    event RoomCreated(uint256 indexed room, address indexed host, uint256 wordCount);
    event RoomJoined(uint256 indexed room, address indexed player);
    event RoomStartedEv(uint256 indexed room, uint64 startBlock, uint64 endBlock, bytes32 seed);
    event RoomTyped(uint256 indexed room, address indexed player, uint256 wordIndex);
    event RoomFinished(uint256 indexed room, address indexed player, uint256 rank, uint256 blocksTaken);

    error NotOrganizer();
    error RoundLive();
    error BadWords();
    error NotStarted();
    error RoundOver();
    error WrongWord();
    error AlreadyFinished();
    error BadName();
    error FundingFailed(address player);
    error NoSolo();
    error NoRoom();
    error NotHost();
    error RoomStarted();
    error RoomFull();
    error NotJoined();

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    /// @param pool word pool for solo runs (the app bundles the same list, in the same order)
    constructor(string memory _eventName, string[] memory pool) {
        organizer = msg.sender;
        eventName = _eventName;
        if (pool.length < 2) revert BadWords();
        for (uint256 i; i < pool.length; ++i) {
            if (bytes(pool[i]).length == 0) revert BadWords();
            _pool.push(bytes8(keccak256(bytes(pool[i]))));
        }
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

    // ------------------------------------------------------------- solo mode

    /// @notice Start (or restart) a personal speed test of SOLO_WORDS words drawn from the pool.
    function startSolo() external {
        Solo storage s = _solo[msg.sender];
        uint256 run;
        unchecked {
            run = ++s.runs;
        }
        bytes32 seed = keccak256(abi.encode(msg.sender, run, blockhash(block.number - 1), block.prevrandao));
        s.seed = seed;
        s.startBlock = uint64(block.number);
        s.done = 0;
        emit SoloStarted(msg.sender, run, seed);
    }

    /// @notice Submit the next word of your solo run.
    function typeSolo(string calldata word) external {
        Solo storage s = _solo[msg.sender];
        uint256 start = s.startBlock;
        if (start == 0) revert NoSolo();
        if (block.number <= start) revert NotStarted();
        uint256 done = s.done;
        if (done >= SOLO_WORDS) revert AlreadyFinished();
        if (bytes8(keccak256(bytes(word))) != _pool[soloWordIndex(s.seed, done)]) revert WrongWord();

        unchecked {
            ++done;
        }
        s.done = uint32(done);
        emit SoloTyped(msg.sender, done - 1);

        if (done == SOLO_WORDS) {
            uint32 blocks = uint32(block.number - start);
            bool pb = s.best == 0 || blocks < s.best;
            _soloHistory[msg.sender].push(blocks);
            if (pb) {
                s.best = blocks;
                _updateTop(msg.sender, blocks);
            }
            emit SoloFinished(msg.sender, s.runs, blocks, pb);
        }
    }

    // ------------------------------------------------------------------ rooms

    uint256 private constant JOINED = 1 << 255;

    /// @notice Open a room; you are its host and first player. Share the returned code.
    function createRoom(uint8 wordCount) external returns (uint256 id) {
        if (wordCount < 3 || wordCount > 40) revert BadWords();
        id = ++lastRoom;
        Room storage r = _rooms[id];
        r.host = msg.sender;
        r.wordCount = wordCount;
        emit RoomCreated(id, msg.sender, wordCount);
        _join(id, r);
    }

    function joinRoom(uint256 id) external {
        Room storage r = _rooms[id];
        if (r.host == address(0)) revert NoRoom();
        if (r.startBlock != 0) revert RoomStarted();
        if (_roomProg[id][msg.sender] & JOINED != 0) return; // already in
        _join(id, r);
    }

    function _join(uint256 id, Room storage r) private {
        if (r.players >= MAX_ROOM_PLAYERS) revert RoomFull();
        _roomProg[id][msg.sender] = JOINED;
        _roomPlayers[id].push(msg.sender);
        unchecked {
            ++r.players;
        }
        emit RoomJoined(id, msg.sender);
    }

    /// @notice Host starts the race: words are drawn now, typing opens after `delayBlocks`.
    function startRoom(uint256 id, uint64 delayBlocks, uint64 durationBlocks) external {
        Room storage r = _rooms[id];
        if (r.host == address(0)) revert NoRoom();
        if (msg.sender != r.host) revert NotHost();
        if (r.startBlock != 0) revert RoomStarted();
        if (delayBlocks == 0 || durationBlocks == 0) revert BadWords();
        bytes32 seed = keccak256(abi.encode(id, blockhash(block.number - 1), block.prevrandao));
        r.seed = seed;
        r.startBlock = uint64(block.number) + delayBlocks;
        r.endBlock = r.startBlock + durationBlocks - 1;
        emit RoomStartedEv(id, r.startBlock, r.endBlock, seed);
    }

    /// @notice Type the next word of the room's race.
    function typeRoom(uint256 id, string calldata word) external {
        Room storage r = _rooms[id];
        uint256 p = _roomProg[id][msg.sender];
        if (p & JOINED == 0) revert NotJoined();
        if (r.startBlock == 0 || block.number < r.startBlock) revert NotStarted();
        if (block.number > r.endBlock) revert RoundOver();
        uint256 done = uint16(p);
        uint256 n = r.wordCount;
        if (done >= n) revert AlreadyFinished();
        if (bytes8(keccak256(bytes(word))) != _pool[soloWordIndex(r.seed, done)]) revert WrongWord();
        unchecked {
            ++done;
        }
        emit RoomTyped(id, msg.sender, done - 1);
        if (done == n) {
            uint256 rank;
            unchecked {
                rank = ++r.finishers;
            }
            uint256 blocks = block.number - r.startBlock + 1;
            _roomProg[id][msg.sender] = JOINED | (blocks << 32) | (rank << 16) | done;
            if (rank == 1) {
                unchecked {
                    ++roomWins[msg.sender];
                }
            }
            emit RoomFinished(id, msg.sender, rank, blocks);
        } else {
            _roomProg[id][msg.sender] = JOINED | done;
        }
    }

    function getRoom(uint256 id)
        external
        view
        returns (
            address host,
            bytes32 seed,
            uint64 startBlock,
            uint64 endBlock,
            uint8 wordCount,
            uint16 players,
            uint16 finishers,
            uint256 blockNumber
        )
    {
        Room storage r = _rooms[id];
        return (r.host, r.seed, r.startBlock, r.endBlock, r.wordCount, r.players, r.finishers, block.number);
    }

    /// @notice Everyone in a room with names and live progress (one call for the lobby and the race).
    function roomBoard(uint256 id)
        external
        view
        returns (address[] memory players, string[] memory names, uint16[] memory done, uint16[] memory rank, uint32[] memory blocks)
    {
        address[] storage list = _roomPlayers[id];
        uint256 n = list.length;
        players = new address[](n);
        names = new string[](n);
        done = new uint16[](n);
        rank = new uint16[](n);
        blocks = new uint32[](n);
        for (uint256 i; i < n; ++i) {
            address a = list[i];
            uint256 p = _roomProg[id][a];
            players[i] = a;
            names[i] = nameOf[a];
            done[i] = uint16(p);
            rank[i] = uint16(p >> 16);
            blocks[i] = uint32(p >> 32);
        }
    }

    /// @notice All finished solo runs of `player`, oldest first, in blocks.
    function soloHistory(address player) external view returns (uint32[] memory) {
        return _soloHistory[player];
    }

    /// @dev Only runs on a personal best, so the shared leaderboard is rarely written.
    function _updateTop(address player, uint32 blocks) private {
        uint256 n = _top.length;
        for (uint256 i; i < n; ++i) {
            if (_top[i] == player) {
                for (uint256 j = i; j + 1 < n; ++j) _top[j] = _top[j + 1];
                _top.pop();
                --n;
                break;
            }
        }
        uint256 pos = n;
        for (uint256 i; i < n; ++i) {
            if (_solo[_top[i]].best > blocks) {
                pos = i;
                break;
            }
        }
        if (pos >= TOP_N) return;
        if (n < TOP_N) {
            _top.push(player);
            ++n;
        }
        for (uint256 j = n - 1; j > pos; --j) _top[j] = _top[j - 1];
        _top[pos] = player;
    }

    /// @notice Pool index of word `i` for a run/room with `seed`. Clients compute the same thing locally.
    /// @dev Walks the pool with a seed-chosen start and stride. The pool size is prime, so the first
    ///      pool.length words of a run are all different: no word repeats inside a run or a room.
    function soloWordIndex(bytes32 seed, uint256 i) public view returns (uint256) {
        uint256 n = _pool.length;
        uint256 x = uint256(seed);
        uint256 start = x % n;
        uint256 step = 1 + (x >> 128) % (n - 1);
        return (start + i * step) % n;
    }

    function poolSize() external view returns (uint256) {
        return _pool.length;
    }

    function poolHash(uint256 i) external view returns (bytes8) {
        return _pool[i];
    }

    function soloState(address player)
        external
        view
        returns (bytes32 seed, uint64 startBlock, uint32 done, uint32 runs, uint32 best, uint256 blockNumber)
    {
        Solo storage s = _solo[player];
        return (s.seed, s.startBlock, s.done, s.runs, s.best, block.number);
    }

    /// @notice Solo leaderboard: best blocks for SOLO_WORDS words, ascending.
    function soloTop() external view returns (address[] memory players, uint32[] memory best, string[] memory names) {
        uint256 n = _top.length;
        players = new address[](n);
        best = new uint32[](n);
        names = new string[](n);
        for (uint256 i; i < n; ++i) {
            players[i] = _top[i];
            best[i] = _solo[players[i]].best;
            names[i] = nameOf[players[i]];
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
