// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WoofCoin (WOOF) - Mock ERC20 Token for Demo
 * @dev 演示用 ERC20 Token，专门用于 Ulysses Protocol hackathon demo。
 * 
 * 核心特点：
 * - ERC20 标准接口（transfer, approve, transferFrom, balanceOf, totalSupply）
 * - Owner mint：部署者可分发 token 给 demo 用户
 * - Faucet：用户可自己领取一次 token，模拟用户“购买”土狗币入账
 * - Burn：用户或 owner 可销毁 token
 * 
 * 设计理念：
 * - 模拟“冲动买入”的目标 token
 * - 演示 stake / slash / claim 流程
 * - 完全可控，部署者可 mint 给测试用户
 * - 每个 faucet 地址只能领取一次，防止重复操作
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WoofCoin is ERC20, Ownable {

    // --- faucet 配置 ---
    uint256 public constant FAUCET_AMOUNT = 1000 * 1e18; // 每个地址通过 faucet 可领取数量

    // --- 防止重复领取映射 ---
    mapping(address => bool) public hasClaimed; // 记录每个地址是否已经领取过 faucet

    /**
     * @dev 构造函数
     * - 初始化 token 名称和符号
     * - 部署时初始 mint 给合约部署者（owner）
     */
    constructor() ERC20("WoofCoin", "WOOF") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 1e18); // 部署者初始持有 1,000,000 WOOF
    }

    /**
     * @notice Owner mint（发给 demo 用户或测试账户）
     * @param to 接收 token 的地址
     * @param amount mint 数量
     * @dev 仅 owner 可调用，确保合约可控
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        _mint(to, amount);
    }

    /**
     * @notice Faucet 功能
     * @dev 用户自己可以领取 FAUCET_AMOUNT 的 token，只能领取一次
     * - 用于 hackathon demo，避免每次都手动分发
     */
    function faucet() external {
        require(!hasClaimed[msg.sender], "Already claimed"); // 检查是否已经领取
        hasClaimed[msg.sender] = true; // 标记已领取
        _mint(msg.sender, FAUCET_AMOUNT); // mint token 给用户
    }

    /**
     * @notice Burn token
     * @param amount 要销毁的 token 数量
     * @dev 用户自己调用，销毁自己持有的 token
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
