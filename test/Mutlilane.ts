import { expect } from "chai";
import { ethers } from "hardhat";
import { Multilane } from "../typechain-types/contracts/Multilane";
import { USDC } from "../typechain-types/contracts/USDC";
import { MailBox } from "../typechain-types/contracts/MailBox";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Multilane", function () {
  let multilane: Multilane;
  let usdc: USDC;
  let accounts: SignerWithAddress[];
  let mailbox: MailBox;

  let addressToBytes32 = (address: string) => {
    const bytes32Value = ethers.utils.arrayify(
      ethers.utils.getAddress(address)
    );
    return ethers.utils.hexZeroPad(bytes32Value, 32);
  };

  let addNewChain = async function (chainId: number) {
    let mailboxFactory = await ethers.getContractFactory("MailBox");
    let mailbox = await mailboxFactory.deploy();
    await mailbox.deployed();

    let WalletLaneFactory = await ethers.getContractFactory("Multilane");
    let wl = await WalletLaneFactory.deploy(usdc.address);

    let tx = await multilane.addChain(chainId, mailbox.address, wl.address);
    await tx.wait();
    // set mailbox address in multilane
    tx = await wl.setMailBox(mailbox.address);
    await tx.wait();

    let count = await multilane.getChainCount();
    // return count - 1 and mailbox address
    return [count.sub(1).toNumber(), mailbox, wl];
  };

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

    let mailboxFactory = await ethers.getContractFactory("MailBox");
    mailbox = await mailboxFactory.deploy();
    await mailbox.deployed();

    // set mailbox address in multilane
    tx = await multilane.setMailBox(mailbox.address);
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

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await multilane.owner()).to.equal(accounts[0].address);
    });

    it("Should set the right USDC address", async function () {
      expect(await multilane.usdc()).to.equal(usdc.address);
    });

    it("Should set the right mailbox address", async function () {
      expect(await multilane.mailBox()).to.equal(mailbox.address);
    });
  });

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

  describe("Add and update chains", function () {
    it("Add new chain", async function () {
      let chainId = 1;
      let [index, mailbox, wl] = await addNewChain(chainId);
      // @ts-ignore
      let chain = await multilane.chains(index);
      expect(chain.id).to.equal(chainId);
      // @ts-ignore
      expect(chain.mailbox).to.equal(mailbox.address);
      // @ts-ignore
      expect(chain.multilane).to.equal(wl.address);
    });

    it("Update chain", async function () {
      let chainId = 1;
      let [index, _] = await addNewChain(chainId);
      let newMailbox = accounts[1].address; // only for testing purpose
      let wl = accounts[2].address; // only for testing purpose
      // @ts-ignore
      let tx = await multilane.updateChain(index, chainId, newMailbox, wl);
      await tx.wait();
      // @ts-ignore
      let chain = await multilane.chains(index);
      expect(chain.mailbox).to.equal(newMailbox);
      expect(chain.multilane).to.equal(wl);
    });
  });

  describe("Trustless withdraw", function () {
    it("Should initiate trustless withdraw", async function () {
      await addNewChain(1);
      await addNewChain(2);

      let amount = 100;
      let tx = await multilane.trustlessWithdraw(amount);
      let receipt = await tx.wait();
      // get block number of the transaction
      let blockNumber = receipt.blockNumber;

      let request = await multilane.withdrawRequests(blockNumber);
      expect(request.amount).to.equal(amount);
    });

    it("Withdraw request whole flow", async function () {
      // Here we are simluating the multiple chains are in one chain by deploying multiple multilane
      // contracts and they dont interact directly with each other. Mailbox will be used to communicate
      // Adding chains
      let [index1, mailbox1, wl1] = await addNewChain(2);
      let [index2, mailbox2, wl2] = await addNewChain(3);

      // making a deposit in walletLane2, basically making a deposit in chainId 3
      let walletLane2 = wl2 as Multilane;
      await deposit(accounts[0], 200, walletLane2);

      // Initiate trustless withdraw request
      let amount = 100;
      let tx = await multilane.trustlessWithdraw(amount, {
        value: ethers.utils.parseEther("0.01"),
      });
      await tx.wait();

      // This for chainId 2 ------------------------------------
      // fetch message in mailbox this is the mailbox in the origin chain
      let message = await mailbox.messages(0);
      let mailBox1 = mailbox1 as MailBox;
      // above message will pass from mailbox to mailbox1 through hyperlane or any bridge
      tx = await mailBox1.trigger(
        1,
        addressToBytes32(multilane.address),
        message.recipientAddress,
        message.messageBody
      );
      await tx.wait();

      // fetch message in mailbox1 this needs to be passed to multilane
      let message1 = await mailBox1.messages(0);
      let walletLane1 = wl1 as Multilane;
      // this above message will be passed to multilane through hyperlane or any bridge
      tx = await mailbox.trigger(
        2,
        addressToBytes32(walletLane1.address),
        message1.recipientAddress,
        message1.messageBody
      );
      await tx.wait();

      // end of chainId 2 ----------------------------------------

      // This for chainId 3 ---------------------------------------
      // fetch message in mailbox this is the mailbox in the origin chain
      message = await mailbox.messages(1);
      let mailBox2 = mailbox2 as MailBox;
      // above message will pass from mailbox to mailbox1 through hyperlane or any bridge
      tx = await mailBox2.trigger(
        1,
        addressToBytes32(multilane.address),
        message.recipientAddress,
        message.messageBody
      );
      await tx.wait();

      // fetch message in mailbox1 this needs to be passed to multilane
      let message2 = await mailBox2.messages(0);
      // this above message will be passed to multilane through hyperlane or any bridge
      tx = await mailbox.trigger(
        3,
        addressToBytes32(walletLane2.address),
        message2.recipientAddress,
        message2.messageBody
      );
      await tx.wait();
      // end of chainId 3 ----------------------------------------
    });
  });
});
