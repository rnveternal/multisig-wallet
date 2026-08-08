// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MultiSigWallet
 * @notice Personal M-of-N multisig wallet. Self-contained, no dependency on
 *         any third-party multisig infrastructure (e.g. Gnosis Safe).
 *         Owners sign an EIP-712 typed message off-chain; anyone can then
 *         submit the collected signatures on-chain to execute the transaction.
 *
 * Design goals:
 *  - Fully self-custodial and self-contained (single file, no external imports)
 *  - M-of-N threshold (default deployment: 3-of-5)
 *  - Replay protection via per-wallet nonce + chainId (EIP-712 domain separator)
 *  - Owners can be rotated and threshold changed via a multisig-approved tx
 *    on the wallet itself (self-governance, no external admin)
 */
contract MultiSigWallet {
    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;   // number of required confirmations
    uint256 public nonce;       // replay protection, increments per executed tx

    // ---------------------------------------------------------------------
    // EIP-712 domain
    // ---------------------------------------------------------------------

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant TX_TYPEHASH =
        keccak256("Transaction(address to,uint256 value,bytes data,uint256 nonce)");

    bytes32 private immutable DOMAIN_SEPARATOR;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposit(address indexed sender, uint256 amount);
    event TransactionExecuted(
        address indexed to,
        uint256 value,
        bytes data,
        uint256 nonce,
        bytes32 txHash
    );
    event OwnersChanged(address[] newOwners, uint256 newThreshold);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySelf() {
        require(msg.sender == address(this), "MultiSig: only wallet itself");
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address[] memory _owners, uint256 _threshold) {
        require(_owners.length > 0, "MultiSig: owners required");
        require(
            _threshold > 0 && _threshold <= _owners.length,
            "MultiSig: invalid threshold"
        );

        uint256 ownersLen = _owners.length;
        for (uint256 i = 0; i < ownersLen; ) {
            address owner = _owners[i];
            require(owner != address(0), "MultiSig: zero address owner");
            require(!isOwner[owner], "MultiSig: duplicate owner");
            isOwner[owner] = true;
            owners.push(owner);
            unchecked { ++i; }
        }

        threshold = _threshold;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("MultiSigWallet")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Core execution
    // ---------------------------------------------------------------------

    /**
     * @notice Compute the EIP-712 digest that owners must sign for a given tx.
     */
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 _nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TX_TYPEHASH, to, value, keccak256(data), _nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    /**
     * @notice Execute a transaction once enough valid owner signatures are collected.
     * @param to Target address
     * @param value ETH value to send
     * @param data Calldata to execute
     * @param signatures Concatenated 65-byte ECDSA signatures (r,s,v), MUST be
     *        sorted by signer address ascending (cheap on-chain dedup check).
     */
    function executeTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata signatures
    ) external returns (bytes memory) {
        require(signatures.length % 65 == 0, "MultiSig: bad signature length");
        uint256 sigCount = signatures.length / 65;
        require(sigCount >= threshold, "MultiSig: not enough signatures");

        bytes32 txHash = getTransactionHash(to, value, data, nonce);

        address lastSigner = address(0);
        uint256 validSignatures = 0;

        for (uint256 i = 0; i < sigCount; ) {
            address signer = _recoverSigner(txHash, signatures, i);
            require(signer > lastSigner, "MultiSig: signatures not sorted or duplicate");
            require(isOwner[signer], "MultiSig: signer not an owner");
            lastSigner = signer;
            unchecked {
                validSignatures++;
                ++i;
            }
        }

        require(validSignatures >= threshold, "MultiSig: threshold not met");

        uint256 executedNonce = nonce;
        unchecked { nonce = executedNonce + 1; }

        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "MultiSig: call reverted");

        emit TransactionExecuted(to, value, data, executedNonce, txHash);
        return result;
    }

    // ---------------------------------------------------------------------
    // Self-governance (owner rotation / threshold change)
    // These can ONLY be called via executeTransaction targeting this
    // contract itself, i.e. they also require M-of-N owner signatures.
    // ---------------------------------------------------------------------

    function setOwners(address[] calldata newOwners, uint256 newThreshold) external onlySelf {
        require(newOwners.length > 0, "MultiSig: owners required");
        require(
            newThreshold > 0 && newThreshold <= newOwners.length,
            "MultiSig: invalid threshold"
        );

        // clear old owners
        uint256 oldLen = owners.length;
        for (uint256 i = 0; i < oldLen; ) {
            isOwner[owners[i]] = false;
            unchecked { ++i; }
        }
        delete owners;

        uint256 newLen = newOwners.length;
        for (uint256 i = 0; i < newLen; ) {
            address owner = newOwners[i];
            require(owner != address(0), "MultiSig: zero address owner");
            require(!isOwner[owner], "MultiSig: duplicate owner");
            isOwner[owner] = true;
            owners.push(owner);
            unchecked { ++i; }
        }

        threshold = newThreshold;
        emit OwnersChanged(newOwners, newThreshold);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _recoverSigner(
        bytes32 digest,
        bytes calldata signatures,
        uint256 index
    ) internal pure returns (address) {
        uint256 offset = index * 65;
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            let sigPtr := add(signatures.offset, offset)
            r := calldataload(sigPtr)
            s := calldataload(add(sigPtr, 32))
            v := byte(0, calldataload(add(sigPtr, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "MultiSig: bad signature v");

        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "MultiSig: invalid signature");
        return signer;
    }
}
