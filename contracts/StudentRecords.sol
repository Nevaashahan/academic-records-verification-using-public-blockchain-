// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StudentRecords {
    struct Record {
        string cid;
        uint256 timestamp;
        address sender;
    }

    uint256 public recordCount;
    mapping(uint256 => Record) public records;

    event RecordAnchored(
        uint256 indexed recordId,
        address indexed sender,
        string cid,
        uint256 timestamp
    );

    function anchorRecord(string calldata cid) external returns (uint256 recordId) {
        require(bytes(cid).length > 0, "CID required");
        recordId = ++recordCount;
        records[recordId] = Record({
            cid: cid,
            timestamp: block.timestamp,
            sender: msg.sender
        });
        emit RecordAnchored(recordId, msg.sender, cid, block.timestamp);
    }
}
