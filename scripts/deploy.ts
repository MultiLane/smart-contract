import { ethers } from "hardhat";

async function main() {
  let accounts = await ethers.getSigners();
  const WalletLaneFactory = await ethers.getContractFactory("Multilane");
  let walletLane = await WalletLaneFactory.deploy(process.env.USDC as string);
  await walletLane.deployed();
  console.log("Multilane deployed to:", walletLane.address);

  let tx = await walletLane.setMailBox(process.env.MAILBOX as string);
  await tx.wait();
  console.log("Mailbox set to:", process.env.MAILBOX as string);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
