// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
}
