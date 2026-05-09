const { ethers, getAddress } = require("ethers");
require("dotenv").config();
const fs = require("fs");
const express = require("express"); 
const cors = require("cors");       
const { sequelize, Stake } = require("./db");


// --- 配置与初始化 ---
const MIN_ERC20_ABI = ["function balanceOf(address account) external view returns (uint256)"];
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const watcherWallet = new ethers.Wallet(process.env.WATCHER_PRIVATE_KEY.trim(), provider);
let STAKING_TOKEN_ADDRESS = "";
let lastScannedBlock = 0;

// --- 核心逻辑：自动化监控循环 ---
async function startTimers() {
    // 1. 监听新质押事件
    setInterval(pollChainEvents, 10000);

    // 2. 核心巡逻逻辑：每 20 秒扫描一次数据库
    setInterval(async () => {
        const now = Math.floor(Date.now() / 1000);
        try {
            const activeStakes = await Stake.findAll({ where: { status: 0 } });

            for (let stake of activeStakes) {
                const forbiddenToken = stake.targetAddress.toLowerCase();
                const userAddress = stake.userAddress.toLowerCase();

                // 【白名单保护】如果禁止币地址被误填为质押币，跳过检查
                if (!STAKING_TOKEN_ADDRESS || forbiddenToken === STAKING_TOKEN_ADDRESS) continue;

                // --- 逻辑 A：检查是否破戒 (持有禁止币) ---
                const tokenContract = new ethers.Contract(forbiddenToken, MIN_ERC20_ABI, provider);
                try {
                    const balance = await tokenContract.balanceOf(userAddress);
                    if (balance > 0n) {
                        console.log(`🚨 破戒！发现用户 ${userAddress} 持有禁止币 ${forbiddenToken}`);
                        await executeContractCall(stake, "slash"); // 调用罚没
                        continue; 
                    }
                } catch (e) { console.warn(`余额查询失败: ${forbiddenToken}`); }

                // --- 逻辑 B：检查是否到期 (未破戒，应返还) ---
                if (stake.unlockTime < now) {
                    console.log(`🎉 恭喜！用户 ${userAddress} 锁定到期且未破戒。`);
                    await executeContractCall(stake, "claim"); // 调用返还
                }
            }
        } catch (err) { console.error("巡逻异常:", err); }
    }, 20000);
}

// --- 统一执行合约调用 (罚没或返还) ---
async function executeContractCall(stakeRecord, method) {
    try {
        const abi = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
        const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, watcherWallet);
        
        console.log(`⏳ 正在执行链上操作: ${method} ...`);
        const tx = await contract[method](stakeRecord.userAddress, stakeRecord.targetAddress);
        await tx.wait();
        
        await stakeRecord.update({ status: 2 }); // 标记为已结算
        console.log(`✅ [${method}] 操作成功完成。`);
    } catch (error) {
        console.error(`❌ [${method}] 失败:`, error.reason || error.message);
        // 如果合约提示已经处理过，同步数据库状态
        if (error.message.includes("already")) await stakeRecord.update({ status: 2 });
    }
}

// --- 事件扫描逻辑 ---
async function pollChainEvents() {
    console.log("🔍 开始尝试巡逻区块...");
    try {
        const abi = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
        const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, provider);

        // 识别质押币白名单
        if (!STAKING_TOKEN_ADDRESS) {
            STAKING_TOKEN_ADDRESS = (await contract.stakingToken()).toLowerCase();
            console.log(`🛡️ 警察系统就绪，质押币白名单: ${STAKING_TOKEN_ADDRESS}`);
        }

        const currentBlock = await provider.getBlockNumber();
        if (lastScannedBlock === 0) lastScannedBlock = currentBlock - 5;
        if (currentBlock <= lastScannedBlock) return;

        const events = await contract.queryFilter("Staked", lastScannedBlock + 1, currentBlock);
        for (let event of events) {
            const [user, target, amount, weight, startTime, unlockTime] = event.args;
            await Stake.findOrCreate({
                where: { userAddress: user.toLowerCase(), unlockTime: Number(unlockTime) },
                defaults: {
                    userAddress: user.toLowerCase(),
                    targetAddress: target.toLowerCase(),
                    amount: ethers.formatEther(amount),
                    unlockTime: Number(unlockTime),
                    status: 0
                }
            });
            console.log(`🔔 记录新质押: 用户 ${user} 承诺不持有 ${target}`);
        }
        lastScannedBlock = currentBlock;
    } catch (err) { console.error("事件扫描失败:", err.message); }
}

// --- 修改后的启动入口 ---
async function main() {
    try {
        // 1. 同步数据库
        await sequelize.sync({ force: true }); 
        console.log("✅ 数据库同步完成。");

        // 2. 启动监控计时器
        await startTimers(); 
        console.log("🚀 后端监控系统已启动，正在后台巡逻...");

        // 3. 【关键】启动一个 Express 端口监听（这会让程序永远跑下去）
        const app = express(); // 确保你开头引入了 express
        app.use(cors());
        
        // 简单写个路由，方便前端查历史记录
        app.get("/history", async (req, res) => {
            const data = await Stake.findAll({ order: [['createdAt', 'DESC']] });
            res.json(data);
        });

        app.listen(3001, () => {
            console.log("🌐 接口已就绪: http://localhost:3001/history");
        });

    } catch (err) {
        console.error("❌ 程序启动失败:", err);
    }
}

main(); // 执行入口