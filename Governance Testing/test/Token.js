const { web3, artifacts } = require("hardhat");
const {
  expectRevert, // Assertions for transactions that should fail
  time,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

//Bringing Out File
const GovernorContract = artifacts.require("MyGovernor");
const GovernanceToken = artifacts.require("GovernanceToken");
const TimeLockController = artifacts.require("TimelockController");
const Treasury = artifacts.require("Box");

// Checking Contract Functionalities
contract("-----Token Contract-----", (accounts) => {
  const owner = accounts[0];
  const minDelay = 3600;
  const proposers = [];
  const executors = [];

  function testAccount(_index) {
    return accounts[_index + 1];
  }
  before(async function () {
    Governance_Token_Instance = await GovernanceToken.new();
    timeLock_Instance = await TimeLockController.new(
      minDelay,
      proposers,
      executors,
      owner
    );
    Governance_Instance = await GovernorContract.new(
      Governance_Token_Instance.address,
      timeLock_Instance.address
    );

    const timelockAdminRole = await timeLock_Instance.DEFAULT_ADMIN_ROLE();
    await timeLock_Instance.grantRole(
      timelockAdminRole,
      Governance_Instance.address,
      { from: owner }
    );
    const properRole = await timeLock_Instance.PROPOSER_ROLE();
    await timeLock_Instance.grantRole(properRole, Governance_Instance.address, {
      from: owner,
    });
    const executorRole = await timeLock_Instance.EXECUTOR_ROLE();
    await timeLock_Instance.grantRole(
      executorRole,
      Governance_Instance.address,
      {
        from: owner,
      }
    );
    await timeLock_Instance.revokeRole(timelockAdminRole, owner, {
      from: owner,
    });
    Treasury_Instance = await Treasury.new(timeLock_Instance.address);
  });

  describe("----------------------- Governance Flow Testing -----------------------", function () {
    it("----------", async () => {
      const voter1 = testAccount(0);
      const voter2 = testAccount(1);

      // Transferring GT Tokens To Voter1 And Voter 2
      // const quorumAmount = web3.utils.toWei("40000", "ether"); // 40,000 tokens (4% of 1M)

      const voter1Amount = web3.utils.toWei("40000", "ether");

      const voter2Amount = web3.utils.toWei("40000", "ether");
      const voter1BeforeBalance = await Governance_Token_Instance.balanceOf(
        voter1
      );

      const voter2BeforeBalance = await Governance_Token_Instance.balanceOf(
        voter2
      );
      await Governance_Token_Instance.transfer(voter1, voter1Amount, {
        from: owner,
      });
      await Governance_Token_Instance.transfer(voter2, voter2Amount, {
        from: owner,
      });
      const voter1AfterBalanceAmount =
        await Governance_Token_Instance.balanceOf(voter1);

      const voter2AfterBalanceAmount =
        await Governance_Token_Instance.balanceOf(voter2);
      expect(String(voter1AfterBalanceAmount)).equal(String(voter1Amount));
      expect(String(voter2AfterBalanceAmount)).equal(String(voter2Amount));
    });
    it("Should have correct voting settings", async () => {
      const votingDelay = await Governance_Instance.votingDelay();
      const votingPeriod = await Governance_Instance.votingPeriod();

      expect(votingDelay.toString()).to.equal("7200");
      expect(votingPeriod.toString()).to.equal("50400");
    });
    it("Create Proposal Vote and Execute Proposal", async () => {
      const voter1 = testAccount(0);
      const voter2 = testAccount(1);

      // Delegate votes
      await Governance_Token_Instance.delegate(voter1, { from: voter1 });
      await Governance_Token_Instance.delegate(voter2, { from: voter2 });

      // Create proposal
      const targets = [Treasury_Instance.address];
      const values = [0];
      const boxValue = "50";
      const calldata = web3.eth.abi.encodeFunctionCall(
        {
          name: "setBoxValue",
          type: "function",
          inputs: [
            {
              type: "uint256",
              name: "_boxValue",
            },
          ],
        },
        [web3.utils.toWei(boxValue, "wei")]
      );
      const description = "setting Box Value 50";

      const voter1Proposal = await Governance_Instance.propose(
        targets,
        values,
        [calldata],
        description,
        { from: voter1 }
      );

      const proposalId = String(voter1Proposal.logs[0].args.proposalId);

      // Check initial state (should be Pending)
      const initialState = await Governance_Instance.state(proposalId);
      expect(String(initialState)).to.equal("0"); // 0 = Pending

      // Mine enough blocks to pass the voting delay (7200 blocks in your contract)
      await mine(7201); // Mine enough blocks to reach voting period

      // Check new state (should be Active)
      const activeState = await Governance_Instance.state(proposalId);
      console.log("Proposal State:", activeState.toString());
      expect(activeState.toString()).to.equal("1"); // 1 = Active

      await Governance_Instance.castVote(proposalId, 1, { from: voter1 });
      await Governance_Instance.castVote(proposalId, 1, { from: voter2 });

      // After casting votes:
      await mine(70000); // Advance through entire voting period
      // time.increase(50400);
      // 1. Check quorum status
      const totalSupply = await Governance_Token_Instance.totalSupply();
      const quorumRequired = totalSupply.muln(4).divn(100); // 4% of total supply
      const votesCast = await Governance_Instance.proposalVotes(proposalId);
      console.log(`Quorum required: ${quorumRequired.toString()}`);
      console.log(`Votes cast: ${votesCast.forVotes.toString()}`);
      // 2. Check vote breakdown
      const proposalVotes = await Governance_Instance.proposalVotes(proposalId);
      console.log(
        `For: ${proposalVotes.forVotes}, Against: ${proposalVotes.againstVotes}, Abstain: ${proposalVotes.abstainVotes}`
      );

      // 3. Verify voting period ended
      const deadline = await Governance_Instance.proposalDeadline(proposalId);
      const currentBlock = await web3.eth.getBlockNumber();
      console.log(
        `Voting ended at block ${deadline}, current block ${currentBlock}`
      );

      // Now check state
      const finalState = await Governance_Instance.state(proposalId);
      console.log("Final state:", finalState.toString());
      expect(finalState.toString()).to.equal("4"); // Should be Succeede
      const succeedsState = await Governance_Instance.state(proposalId);
      console.log("🍑 succeedsState", String(succeedsState));
      expect(String(succeedsState)).equal(String(4));
      // After voting period ends and proposal succeeds:
      const descriptionHash = web3.utils.keccak256(description);
      await Governance_Instance.queue(
        targets,
        values,
        [calldata],
        descriptionHash,
        { from: voter1 }
      );

      // // Wait for timelock delay
      await time.increase(3600); // 1 hour
      console.log("timerlockAddress", timeLock_Instance.address);
      console.log("govern address", Governance_Instance.address);
      console.log("voter1", voter1);
      await Governance_Instance.execute(
        targets,
        values,
        [calldata],
        descriptionHash,
        { from: voter1 }
      );
      const newBoxValue = await Treasury_Instance.boxValue();
      expect(newBoxValue.toString()).to.equal(web3.utils.toWei("50", "wei"));
    });
  });
});
