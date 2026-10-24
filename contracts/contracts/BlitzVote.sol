// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlitzVote — on-chain audience voting for one-day hackathons on Monad
/// @notice Organizer registers projects and pre-funded burner wallets (handed out as QR codes).
///         Each burner votes once, can't vote for its own team, and can send unlimited reactions.
/// @dev Vote counters are sharded by voter address so that a room full of people voting for the
///      same project at the same second don't all write the same storage slot. Monad executes
///      transactions optimistically in parallel; fewer shared-slot writes means fewer conflicts
///      and re-executions.
contract BlitzVote {
    // ------------------------------------------------------------------ types

    enum Phase {
        Setup, // projects & voters being registered
        Open, // voting live
        Closed // results final
    }

    struct Project {
        string name;
        string team;
    }

    // ---------------------------------------------------------------- storage

    uint256 public constant SHARDS = 16;

    address public immutable organizer;
    string public eventName;
    Phase public phase;

    Project[] private _projects;

    /// voter => registered?
    mapping(address => bool) public isVoter;
    /// voter => (projectId + 1) of the team they belong to, 0 = audience
    mapping(address => uint256) public teamOf;
    /// voter => (projectId + 1) they voted for, 0 = not voted yet
    mapping(address => uint256) public voteOf;

    /// projectId => shard => votes
    mapping(uint256 => mapping(uint256 => uint256)) private _votes;
    /// shard => total votes cast
    mapping(uint256 => uint256) private _totalVotes;

    uint256 public voterCount;

    // ----------------------------------------------------------------- events

    event ProjectAdded(uint256 indexed projectId, string name, string team);
    event VotersRegistered(uint256 count, uint256 indexed teamProjectId, uint256 fundingPerVoter);
    event PhaseChanged(Phase phase);
    event Voted(address indexed voter, uint256 indexed projectId);
    event Reacted(address indexed voter, uint256 indexed projectId, uint8 emoji);

    // ----------------------------------------------------------------- errors

    error NotOrganizer();
    error WrongPhase();
    error NotVoter();
    error AlreadyVoted();
    error OwnProject();
    error UnknownProject();
    error FundingFailed(address voter);

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    constructor(string memory _eventName) {
        organizer = msg.sender;
        eventName = _eventName;
    }

    // ------------------------------------------------------------ organizer

    function addProjects(string[] calldata names, string[] calldata teams) external onlyOrganizer {
        if (phase != Phase.Setup) revert WrongPhase();
        require(names.length == teams.length, "length mismatch");
        for (uint256 i; i < names.length; ++i) {
            _projects.push(Project(names[i], teams[i]));
            emit ProjectAdded(_projects.length - 1, names[i], teams[i]);
        }
    }

    /// @notice Whitelist burner wallets and split msg.value equally between them as gas money.
    /// @param voters burner addresses
    /// @param teamProjectIdPlusOne 0 for audience, otherwise (projectId + 1) of the team these burners belong to
    /// @dev Allowed during Setup and Open, so late arrivals can still get a QR.
    function registerVoters(address[] calldata voters, uint256 teamProjectIdPlusOne) external payable onlyOrganizer {
        if (phase == Phase.Closed) revert WrongPhase();
        if (teamProjectIdPlusOne > _projects.length) revert UnknownProject();
        uint256 n = voters.length;
        uint256 each = n == 0 ? 0 : msg.value / n;
        for (uint256 i; i < n; ++i) {
            address v = voters[i];
            if (!isVoter[v]) {
                isVoter[v] = true;
                ++voterCount;
            }
            teamOf[v] = teamProjectIdPlusOne;
            if (each > 0) {
                (bool ok,) = v.call{value: each}("");
                if (!ok) revert FundingFailed(v);
            }
        }
        // dust from integer division goes back to the organizer
        uint256 dust = msg.value - each * n;
        if (dust > 0) {
            (bool ok,) = organizer.call{value: dust}("");
            require(ok, "dust refund failed");
        }
        emit VotersRegistered(n, teamProjectIdPlusOne, each);
    }

    function openVoting() external onlyOrganizer {
        if (phase != Phase.Setup) revert WrongPhase();
        phase = Phase.Open;
        emit PhaseChanged(Phase.Open);
    }

    function closeVoting() external onlyOrganizer {
        if (phase != Phase.Open) revert WrongPhase();
        phase = Phase.Closed;
        emit PhaseChanged(Phase.Closed);
    }

    // --------------------------------------------------------------- voters

    function vote(uint256 projectId) external {
        if (phase != Phase.Open) revert WrongPhase();
        if (!isVoter[msg.sender]) revert NotVoter();
        if (voteOf[msg.sender] != 0) revert AlreadyVoted();
        if (projectId >= _projects.length) revert UnknownProject();
        if (teamOf[msg.sender] == projectId + 1) revert OwnProject();

        voteOf[msg.sender] = projectId + 1;
        uint256 shard = uint256(uint160(msg.sender)) % SHARDS;
        unchecked {
            ++_votes[projectId][shard];
            ++_totalVotes[shard];
        }
        emit Voted(msg.sender, projectId);
    }

    /// @notice Free-form applause during demos. No storage writes at all — pure event, fully parallel.
    function react(uint256 projectId, uint8 emoji) external {
        if (phase == Phase.Closed) revert WrongPhase();
        if (!isVoter[msg.sender]) revert NotVoter();
        if (projectId >= _projects.length) revert UnknownProject();
        emit Reacted(msg.sender, projectId, emoji);
    }

    // ---------------------------------------------------------------- views

    function projectCount() external view returns (uint256) {
        return _projects.length;
    }

    function getProjects() external view returns (Project[] memory) {
        return _projects;
    }

    function votesFor(uint256 projectId) public view returns (uint256 sum) {
        for (uint256 s; s < SHARDS; ++s) {
            sum += _votes[projectId][s];
        }
    }

    function totalVotes() public view returns (uint256 sum) {
        for (uint256 s; s < SHARDS; ++s) {
            sum += _totalVotes[s];
        }
    }

    /// @notice Everything a client needs in one call.
    function snapshot()
        external
        view
        returns (Phase _phase, uint256 _voterCount, uint256 _totalVotesCast, Project[] memory projects, uint256[] memory votes)
    {
        projects = _projects;
        votes = new uint256[](projects.length);
        for (uint256 i; i < projects.length; ++i) {
            votes[i] = votesFor(i);
        }
        return (phase, voterCount, totalVotes(), projects, votes);
    }
}
