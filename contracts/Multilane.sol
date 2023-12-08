// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Multilane is Ownable {
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public spending;
    mapping(address => uint256) public paid;
    event Deposit(address indexed sender, uint256 amount);
    event Withdraw(address indexed sender, uint256 amount, uint256 blockNumber);
    IERC20 public usdc;

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
}
