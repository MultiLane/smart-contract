// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./MailBox.sol";

contract Multilane is Ownable {
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public spending;
    mapping(address => uint256) public paid;
    event Deposit(address indexed sender, uint256 amount);
    event Withdraw(address indexed sender, uint256 amount, uint256 blockNumber);
    IERC20 public usdc;
    Chain[] public chains;
    mapping(uint256 => Chain) public chainMap;
    mapping(uint256 => TrustlessWithdrawRequest) public withdrawRequests;
    MailBox public mailBox;

    struct Chain {
        uint256 id;
        address mailbox;
        address multilane;
    }

    struct TrustlessWithdrawRequest {
        uint256 totalDeposits;
        uint256 totalPaid;
        uint256 totalSpending;
        uint256 amount;
        mapping(uint256 => bool) chains; // For keeping track of which chains have updated the above values
        uint256 chainCount;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /**
     @dev check whether the address is a contract
     @param _addr address to check
     */
    function isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }

    /**
     @dev check whether the contract has owner() function
     @param _contract address of the contract to check
     */
    function hasOwnerFunction(address _contract) internal view returns (bool) {
        bytes4 selector = bytes4(keccak256("owner()"));
        (bool success, ) = _contract.staticcall(
            abi.encodeWithSelector(selector)
        );
        return success;
    }

    /**
     @dev get the owner of the contract
     @param _contract address of the contract to check
     */
    function getOwner(address _contract) internal view returns (address) {
        bytes4 selector = bytes4(keccak256("owner()"));
        (bool success, bytes memory data) = _contract.staticcall(
            abi.encodeWithSelector(selector)
        );

        if (success && data.length == 32) {
            // Assuming the owner() function returns a single 32-byte value (address)
            address ownerAddress;
            assembly {
                ownerAddress := mload(add(data, 32))
            }
            return ownerAddress;
        } else {
            // Return a default value or handle the case when the owner() function doesn't return an address
            return address(0);
        }
    }

    /**
     * @dev get actual sender of the message
     */
    function msgSender() internal view returns (address) {
        // check whether msg.sender is a contract
        if (isContract(msg.sender)) {
            // check whether the contract has owner() function
            if (hasOwnerFunction(msg.sender)) {
                address owner = getOwner(msg.sender);
                if (owner != address(0)) {
                    return owner;
                }
            }
        }
        return msg.sender;
    }

    /**
     @dev deposit ERC20 to the contract
     @param _amount amount of ERC20 to deposit
     */
    function deposit(uint256 _amount) public {
        usdc.transferFrom(msg.sender, address(this), _amount);
        deposits[msgSender()] += _amount;
        emit Deposit(msgSender(), _amount);
    }

    function _withdraw(
        address _sender,
        uint256 _amount,
        uint256 _blockNumber
    ) internal {
        if (deposits[_sender] < _amount) {
            spending[_sender] += _amount; // as the deposit is less than the amount, becuase he has deposited somewhere else. In order for the calculation to work we need to add the amount to spending
        } else {
            deposits[_sender] -= _amount;
        }
        usdc.transfer(_sender, _amount);
        emit Withdraw(_sender, _amount, _blockNumber);
    }

    /**
     @dev withdraw ERC20 from the contract. Requires approval of contract owner and depositor.
     @param _amount amount of ERC20 to withdraw
     @param v signature param
     @param r signature param
     @param s signature param
     */
    function withdraw(uint256 _amount, uint8 v, bytes32 r, bytes32 s) public {
        require(deposits[msgSender()] >= _amount, "Insufficient funds");
        require(
            owner() ==
                ECDSA.recover(
                    MessageHashUtils.toEthSignedMessageHash(
                        keccak256(abi.encodePacked(msgSender(), _amount))
                    ),
                    v,
                    r,
                    s
                ),
            "Invalid signature"
        );
        // get current block number
        _withdraw(msgSender(), _amount, block.number);
    }

    /**
     * @dev transfer the money to the contract and remove from user's depoist
     * @param _pay is the amount of money he is transferring
     * @param v signature param
     * @param r signature param
     * @param s signature param
     */
    function pay(uint256 _pay, uint8 v, bytes32 r, bytes32 s) public {
        require(
            owner() ==
                ECDSA.recover(
                    MessageHashUtils.toEthSignedMessageHash(
                        keccak256(abi.encodePacked(msgSender(), _pay))
                    ),
                    v,
                    r,
                    s
                ),
            "Invalid signature"
        );
        paid[msgSender()] += _pay;
    }

    /**
     * @dev borrow: this function is called by the scw. scw will borrow the money from the contract and then execute the transaction.
     * @param _amount is the amount of money the scw is borrowing, This amount will be signed by the owner of the contract
     * @param v signature param
     * @param r signature param
     * @param s signature param
     */
    function borrow(uint256 _amount, uint8 v, bytes32 r, bytes32 s) public {
        require(
            owner() ==
                ECDSA.recover(
                    MessageHashUtils.toEthSignedMessageHash(
                        keccak256(abi.encodePacked(msgSender(), _amount))
                    ),
                    v,
                    r,
                    s
                ),
            "Invalid signature"
        );
        usdc.transfer(msg.sender, _amount); // Using msg.sender becuase we want the funds to get transfer to the scw not EOA
        spending[msgSender()] += _amount;
    }

    /**
     * @dev addressToBytes32: convert address to bytes32
     */
    function addressToBytes32(address _addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_addr)));
    }

    /**
     * @dev bytes32ToAddress: convert bytes32 to address
     */
    function bytes32ToAddress(
        bytes32 _bytes32
    ) internal pure returns (address) {
        return address(uint160(uint256(_bytes32)));
    }

    /**
     * @dev trustlessWithdraw: In this function actual spending, paid and deposit is fetched
     * from different chains and then the money is transfered to the user
     * @param _amount this is the amount which user is trying to withdraw
     */
    function trustlessWithdraw(uint256 _amount) public payable {
        TrustlessWithdrawRequest storage request = withdrawRequests[
            block.number
        ];
        request.totalDeposits = deposits[msgSender()];
        request.totalPaid = paid[msgSender()];
        request.totalSpending = spending[msgSender()];
        request.amount = _amount;
        request.chainCount = 0; // chain where this contract is deployed is not counted, this is the count of chains external to this chain
        uint256 value = msg.value / chains.length;
        // loop through all the chains and send the request to them
        for (uint256 i = 0; i < chains.length; i++) {
            if (chains[i].id != 0) {
                // send the request to the chain
                mailBox.dispatch{value: value}(
                    uint32(chains[i].id),
                    addressToBytes32(chains[i].multilane),
                    abi.encode(
                        0, // 0 is for withdraw Request, 1 is for withdraw Response
                        msgSender(),
                        _amount,
                        block.number,
                        deposits[msgSender()],
                        paid[msgSender()],
                        spending[msgSender()]
                    )
                );
            }
        }
    }

    function handleWithdrawRequest(
        uint32 _origin,
        bytes32 _sender,
        address _user,
        uint256 _amount,
        uint256 _blockNumber
    ) internal {
        mailBox.dispatch(
            _origin,
            _sender,
            abi.encode(
                1, // 0 is for withdraw Request, 1 is for withdraw Response
                _user,
                _amount,
                _blockNumber,
                deposits[_user],
                paid[_user],
                spending[_user]
            )
        );
    }

    function handle(
        uint32 _origin,
        bytes32 _sender,
        bytes calldata _message
    ) external payable {
        require(
            msg.sender == address(mailBox),
            "MailboxClient: sender not mailbox"
        );
        require(_origin != 0, "WalletLane: origin chain id cannot be 0");
        require(
            _sender != bytes32(0),
            "WalletLane: sender address cannot be 0"
        );
        require(_message.length != 0, "WalletLane: message cannot be empty");
        (
            uint256 _function,
            address _user,
            uint256 _amount,
            uint256 _blockNumber,
            uint256 _totalDeposits,
            uint256 _totalPaid,
            uint256 _totalSpending
        ) = abi.decode(
                _message,
                (uint256, address, uint256, uint256, uint256, uint256, uint256)
            );
        if (_function == 0) {
            handleWithdrawRequest(
                _origin,
                _sender,
                _user,
                _amount,
                _blockNumber
            );
            // send all the values to the chain where the request came from
        } else if (_function == 1) {
            // check whether chainId and sender address match
            require(
                chainMap[_origin].multilane == bytes32ToAddress(_sender),
                "WalletLane: chainId and sender address do not match"
            );
            // check whether this request is already processed by checking chains mapping in the request
            TrustlessWithdrawRequest storage request = withdrawRequests[
                _blockNumber
            ];
            if (!request.chains[_origin]) {
                request.chains[_origin] = true;
                request.chainCount++;
                request.totalDeposits += _totalDeposits;
                request.totalPaid += _totalPaid;
                request.totalSpending += _totalSpending;
                // // check whether all the chains have responded
                if (request.chainCount == chains.length) {
                    uint256 actualBalance = request.totalDeposits -
                        request.totalSpending +
                        request.totalPaid;
                    require(
                        actualBalance >= request.amount,
                        "WalletLane: Insufficient funds"
                    );
                    // transfer the money to the user
                    _withdraw(_user, request.amount, _blockNumber);
                }
            }
        }
    }

    /**
     * @dev setMailBox: set the address of the walletlane contract
     * This function could be moved to the constructor but we are keeping it here for testing purposes
     */
    function setMailBox(address _mailBoxAddress) public onlyOwner {
        mailBox = MailBox(_mailBoxAddress);
    }

    /**
     @dev add a new chain to the contract
     @param _id id of the chain
     @param _mailbox address of the mailbox contract
     */
    function addChain(
        uint256 _id,
        address _mailbox,
        address _walletLane
    ) public onlyOwner {
        chainMap[_id] = Chain(_id, _mailbox, _walletLane);
        chains.push(Chain(_id, _mailbox, _walletLane));
    }

    /**
     * @dev update chain details
     * @param _index index of the chain
     * @param _id id of the chain
     * @param _mailbox address of the mailbox contract
     */
    function updateChain(
        uint256 _index,
        uint256 _id,
        address _mailbox,
        address _walletLane
    ) public onlyOwner {
        chains[_index] = Chain(_id, _mailbox, _walletLane);
        chainMap[_id] = Chain(_id, _mailbox, _walletLane);
    }

    /**
     * @dev delete chain details
     * @param _index index of the chain
     */
    function deleteChain(uint256 _index) public onlyOwner {
        delete chainMap[chains[_index].id];
        delete chains[_index];
    }

    /**
     * @dev get total number of chains
     */
    function getChainCount() public view returns (uint256) {
        return chains.length;
    }
}
