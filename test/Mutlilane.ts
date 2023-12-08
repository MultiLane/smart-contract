import { expect } from "chai";
import { ethers } from "hardhat";
import { Multilane } from "../typechain-types/contracts/Multilane";
import { USDC } from "../typechain-types/contracts/USDC";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Multilane", function () {
  let multilane: Multilane;
  let usdc: USDC;
  let accounts: SignerWithAddress[];

  this.beforeEach(async function () {
    accounts = await ethers.getSigners();
    const UsdcFactory = await ethers.getContractFactory("USDC");
    usdc = await UsdcFactory.deploy();
    await usdc.deployed();

    const MultilaneFactory = await ethers.getContractFactory("Multilane");
    multilane = await MultilaneFactory.deploy(usdc.address);

    await multilane.deployed();
    // mint some USDC to Multilane
    let tx = await usdc.mint(multilane.address, 100000);
    await tx.wait();
  });

  let deposit = async function (
    account: SignerWithAddress,
    amount: number,
    ml?: Multilane
  ) {
    if (!ml) ml = multilane;
    let tx = await usdc.mint(account.address, amount);
    await tx.wait();
    await usdc.connect(account).approve(ml.address, amount);
    await ml.connect(account).deposit(amount);
  };

  describe("Deposit", function () {
    it("Should deposit 100 USDC", async function () {
      let amount = 100;
      let balance_before = await usdc.balanceOf(multilane.address);
      await deposit(accounts[1], amount);
      expect(
        (await usdc.balanceOf(multilane.address)).sub(balance_before)
      ).to.equal(amount);
      expect(await multilane.deposits(accounts[1].address)).to.equal(amount);
    });

    it("Should deposit from SCW", async function () {
      let scwFactory = await ethers.getContractFactory("SCW");
      let scw = await scwFactory.deploy();
      await scw.deployed();
      let balance_before = await usdc.balanceOf(multilane.address);

      let amount = 100;
      let value = 0;
      // encode data for deposit function call

      // mint 100 USDC to SCW
      let tx = await usdc.mint(scw.address, amount);
      await tx.wait();

      // encode data for approve function call
      let data = usdc.interface.encodeFunctionData("approve", [
        multilane.address,
        amount,
      ]);
      tx = await scw.execute(usdc.address, value, data);
      await tx.wait();

      data = multilane.interface.encodeFunctionData("deposit", [amount]);
      let to = multilane.address;

      tx = await scw.execute(to, value, data);
      await tx.wait();

      expect(
        (await usdc.balanceOf(multilane.address)).sub(balance_before)
      ).to.equal(amount);
      expect(await multilane.deposits(accounts[0].address)).to.equal(amount);
    });
  });
});
