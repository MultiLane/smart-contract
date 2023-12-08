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

  describe("Withdraw", function () {
    it("Should withdraw 100 USDC", async function () {
      const amount = 100;
      let balance_before = await usdc.balanceOf(multilane.address);
      await deposit(accounts[1], amount);
      // owner of the contract sign to withdraw funds
      let message = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [accounts[1].address, amount]
      );
      let signature = await accounts[0].signMessage(
        ethers.utils.arrayify(message)
      );
      let { r, s, v } = ethers.utils.splitSignature(signature);
      // here whole amount is withdrawn, hence the balance will be same as before
      let tx = await multilane.connect(accounts[1]).withdraw(amount, v, r, s);
      await tx.wait();
      expect(await usdc.balanceOf(multilane.address)).to.equal(balance_before);
      expect(await multilane.deposits(accounts[1].address)).to.equal(0);
      expect(await usdc.balanceOf(accounts[1].address)).to.equal(100);
    });
  });

  describe("Pay", function () {
    it("Deposit and pay 100 USDC", async function () {
      // In this case we are assuming that user has deposited 100 and he has used 50 usdc in some other chain which want's to pay back
      const amount = 100;
      const pay = 50;
      await deposit(accounts[1], amount);
      // owner of the contract sign the spending and paid, spending = amount and paid = 0
      let message = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [accounts[1].address, pay]
      );
      let signature = await accounts[0].signMessage(
        ethers.utils.arrayify(message)
      );
      let { r, s, v } = ethers.utils.splitSignature(signature);
      let tx = await multilane.connect(accounts[1]).pay(pay, v, r, s);
      await tx.wait();
      expect(await multilane.paid(accounts[1].address)).to.equal(50);
    });
  });

  describe("Borrow", function () {
    it("Should borrow 100 USDC", async function () {
      const amount = 100;
      // owner of the contract sign the spending and paid, spending = amount and paid = 0
      let message = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [accounts[1].address, amount]
      );
      let signature = await accounts[0].signMessage(
        ethers.utils.arrayify(message)
      );
      let { r, s, v } = ethers.utils.splitSignature(signature);
      let tx = await multilane.connect(accounts[1]).borrow(amount, v, r, s);
      await tx.wait();
      expect(await multilane.spending(accounts[1].address)).to.equal(amount);
    });

    it("SCW borrowing and sending money to another person", async function () {
      // This is a brand new SCW, it does not have any money but user has deposited 100 USDC somewhere
      // and the contract is paying for the transaction
      let scwFactory = await ethers.getContractFactory("SCW");
      let scw = await scwFactory.connect(accounts[1]).deploy();
      let balance_before = await usdc.balanceOf(multilane.address);

      let amount = 100;

      // contract owner is signing the message
      let message = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [accounts[1].address, amount]
      );
      let signature = await accounts[0].signMessage(
        ethers.utils.arrayify(message)
      );

      let { r, s, v } = ethers.utils.splitSignature(signature);

      // encode data for borrow function call
      let borrow_data = multilane.interface.encodeFunctionData("borrow", [
        amount,
        v,
        r,
        s,
      ]);
      let borrow_to = multilane.address;

      // encode data to send money to accounts[2]
      let send_data = usdc.interface.encodeFunctionData("transfer", [
        accounts[2].address,
        amount,
      ]);
      let send_to = usdc.address;

      // execute both these function together by calling executeBatch in SCW
      let tx = await scw.executeBatch(
        [borrow_to, send_to],
        [0, 0],
        [borrow_data, send_data]
      );
      await tx.wait();

      expect(
        balance_before.sub(await usdc.balanceOf(multilane.address))
      ).to.equal(amount);
      expect(await multilane.spending(accounts[1].address)).to.equal(amount);
      expect(await usdc.balanceOf(accounts[2].address)).to.equal(amount);
    });
  });
});
