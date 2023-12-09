// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/access/Ownable.sol";

// This is a contract to mock the Hyperlane bridge. It is not intended for production use.
contract MailBox is Ownable {
    Message[] public messages;
    uint256 lastProcessedMessage;

    struct Message {
        uint32 destinationDomain;
        bytes32 recipientAddress;
        bytes messageBody;
    }

    constructor() Ownable(msg.sender) {}

    event MessageDispatched(
        uint32 indexed destinationDomain,
        bytes32 indexed recipientAddress,
        bytes messageBody
    );

    function dispatch(
        uint32 destinationDomain,
        bytes32 recipientAddress,
        bytes calldata messageBody
    ) external payable returns (bytes32 messageId) {
        Message memory message = Message(
            destinationDomain,
            recipientAddress,
            messageBody
        );
        messages.push(message);
        emit MessageDispatched(
            destinationDomain,
            recipientAddress,
            messageBody
        );
        return keccak256(messageBody);
    }

    function bytes32ToAddress(
        bytes32 _bytes32
    ) internal pure returns (address) {
        return address(uint160(uint256(_bytes32)));
    }

    function totalMessages() external view returns (uint256) {
        return messages.length;
    }

    // hyperlane relayers will call this function to trigger the stuff on walletlane
    function trigger(
        uint32 _origin,
        bytes32 _sender,
        bytes32 _to,
        bytes calldata _message
    ) external payable onlyOwner {
        address walletlane = bytes32ToAddress(_to);
        // call handle on walletlane
        (bool success, bytes memory result) = walletlane.call{value: msg.value}(
            abi.encodeWithSignature(
                "handle(uint32,bytes32,bytes)",
                _origin,
                _sender,
                _message
            )
        );
        require(success, string(result));
    }
}
