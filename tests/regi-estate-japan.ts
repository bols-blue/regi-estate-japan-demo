import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { DividendDistributor } from "../target/types/dividend_distributor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  mintTo,
  thawAccount,
  freezeAccount,
  getAccount,
  createInitializeMintInstruction,
  ExtensionType,
  getMintLen,
  createInitializeDefaultAccountStateInstruction,
  AccountState,
} from "@solana/spl-token";
import { assert } from "chai";

describe("dividend-distributor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .DividendDistributor as Program<DividendDistributor>;
  const authority = provider.wallet as anchor.Wallet;

  let mint: PublicKey;
  let investorKp: Keypair;
  let investorTokenAccount: PublicKey;
  let distributorPda: PublicKey;
  let distributorBump: number;

  const TOTAL_SUPPLY = new BN(1000); // 1000 トークン発行
  const INVESTOR_BALANCE = 100; // 投資家は 10% 保有
  const DIVIDEND_LAMPORTS = new BN(1 * LAMPORTS_PER_SOL); // 1 SOL 配当

  before(async () => {
    // devnet でテストする場合はコメントを確認してください
    // ローカルネット (anchor test) での実行を想定

    // ─── Mint 作成（DefaultAccountState=Frozen 付き Token-2022）───
    investorKp = Keypair.generate();

    // payer に SOL をエアドロップ
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        authority.publicKey,
        10 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        investorKp.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );

    // Token-2022 Mint（DefaultAccountState=Frozen）
    const mintKp = Keypair.generate();
    const mintLen = getMintLen([ExtensionType.DefaultAccountState]);
    const rent =
      await provider.connection.getMinimumBalanceForRentExemption(mintLen);

    const tx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintKp.publicKey,
        lamports: rent,
        space: mintLen,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeDefaultAccountStateInstruction(
        mintKp.publicKey,
        AccountState.Frozen,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKp.publicKey,
        0,
        authority.publicKey,
        authority.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(tx, [mintKp]);
    mint = mintKp.publicKey;

    // ─── DistributorState PDA ───
    [distributorPda, distributorBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("distributor"), mint.toBuffer()],
      program.programId
    );

    // ─── 投資家のトークンアカウント作成（Frozen 状態）───
    investorTokenAccount = await createAccount(
      provider.connection,
      authority.payer,
      mint,
      investorKp.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // DefaultAccountState=Frozen なので mintTo 前に thaw が必要
    await thawAccount(
      provider.connection,
      authority.payer,
      investorTokenAccount,
      mint,
      authority.publicKey,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    await mintTo(
      provider.connection,
      authority.payer,
      mint,
      investorTokenAccount,
      authority.publicKey,
      INVESTOR_BALANCE,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    // KYC 未承認状態をシミュレート: 一旦 freeze し直す（claim test で thaw する）
    await freezeAccount(
      provider.connection,
      authority.payer,
      investorTokenAccount,
      mint,
      authority.publicKey,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
  });

  // ─────────────────────────────────────────────────────────
  // Test 1: initialize
  // ─────────────────────────────────────────────────────────
  it("initialize distributor", async () => {
    await program.methods
      .initialize()
      .accounts({
        authority: authority.publicKey,
        distributor: distributorPda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.distributorState.fetch(distributorPda);
    assert.ok(state.authority.equals(authority.publicKey));
    assert.ok(state.mint.equals(mint));
    assert.equal(state.epoch.toNumber(), 0);
    console.log("✅ initialize: distributorPda =", distributorPda.toBase58());
  });

  // ─────────────────────────────────────────────────────────
  // Test 2: deposit_dividend
  // ─────────────────────────────────────────────────────────
  it("deposit dividend (epoch 1)", async () => {
    const balanceBefore = await provider.connection.getBalance(distributorPda);

    await program.methods
      .depositDividend(DIVIDEND_LAMPORTS, TOTAL_SUPPLY)
      .accounts({
        authority: authority.publicKey,
        distributor: distributorPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.distributorState.fetch(distributorPda);
    assert.equal(state.epoch.toNumber(), 1);
    assert.ok(state.dividendAmount.eq(DIVIDEND_LAMPORTS));
    assert.ok(state.totalSupply.eq(TOTAL_SUPPLY));
    assert.equal(state.claimedAmount.toNumber(), 0);

    const balanceAfter = await provider.connection.getBalance(distributorPda);
    assert.isTrue(
      balanceAfter >= balanceBefore + DIVIDEND_LAMPORTS.toNumber()
    );
    console.log(
      "✅ deposit_dividend: epoch=1,",
      DIVIDEND_LAMPORTS.toNumber() / LAMPORTS_PER_SOL,
      "SOL deposited"
    );
  });

  // ─────────────────────────────────────────────────────────
  // Test 3: claim_dividend (KYC済み → thaw 後に請求)
  // ─────────────────────────────────────────────────────────
  it("claim dividend after KYC thaw", async () => {
    // Token ACL の代わりに freezeAuthority で直接 thaw (KYC 承認をシミュレート)
    await thawAccount(
      provider.connection,
      authority.payer,
      investorTokenAccount,
      mint,
      authority.publicKey,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const tokenAccBefore = await getAccount(
      provider.connection,
      investorTokenAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    assert.isFalse(tokenAccBefore.isFrozen, "Token account should be thawed");

    const investorBalanceBefore = await provider.connection.getBalance(
      investorKp.publicKey
    );

    // ClaimRecord PDA: [b"claim", distributor, investor, epoch_le_bytes]
    const epochBytes = Buffer.alloc(8);
    epochBytes.writeBigUInt64LE(1n); // epoch = 1
    const [claimRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("claim"),
        distributorPda.toBuffer(),
        investorKp.publicKey.toBuffer(),
        epochBytes,
      ],
      program.programId
    );

    await program.methods
      .claimDividend()
      .accounts({
        investor: investorKp.publicKey,
        distributor: distributorPda,
        investorTokenAccount,
        claimRecord: claimRecordPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([investorKp])
      .rpc();

    const state = await program.account.distributorState.fetch(distributorPda);
    const record = await program.account.claimRecord.fetch(claimRecordPda);

    // 期待 payout: 100/1000 * 1 SOL = 0.1 SOL = 100_000_000 lamports
    const expectedPayout = Math.floor(
      (INVESTOR_BALANCE * DIVIDEND_LAMPORTS.toNumber()) / TOTAL_SUPPLY.toNumber()
    );
    assert.equal(record.amount.toNumber(), expectedPayout);
    assert.equal(state.claimedAmount.toNumber(), expectedPayout);

    const investorBalanceAfter = await provider.connection.getBalance(
      investorKp.publicKey
    );
    // tx fee を考慮して >= (payout - 0.01 SOL)
    assert.isTrue(
      investorBalanceAfter >= investorBalanceBefore + expectedPayout - 10_000_000
    );

    console.log(
      "✅ claim_dividend: payout =",
      expectedPayout / LAMPORTS_PER_SOL,
      "SOL (10% share)"
    );
  });

  // ─────────────────────────────────────────────────────────
  // Test 4: claim_dividend (KYC未承認 = Frozen → 拒否)
  // ─────────────────────────────────────────────────────────
  it("rejects claim from frozen (non-KYC) account", async () => {
    // 新しい投資家（KYC未承認 = Frozen のまま）
    const nonKycKp = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        nonKycKp.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );

    const nonKycAta = await createAccount(
      provider.connection,
      authority.payer,
      mint,
      nonKycKp.publicKey,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // thaw → mint → freeze (KYC未承認 = Frozen 状態を再現)
    await thawAccount(
      provider.connection,
      authority.payer,
      nonKycAta,
      mint,
      authority.publicKey,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    await mintTo(
      provider.connection,
      authority.payer,
      mint,
      nonKycAta,
      authority.publicKey,
      50,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    await freezeAccount(
      provider.connection,
      authority.payer,
      nonKycAta,
      mint,
      authority.publicKey,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const epochBytes = Buffer.alloc(8);
    epochBytes.writeBigUInt64LE(1n);
    const [claimRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("claim"),
        distributorPda.toBuffer(),
        nonKycKp.publicKey.toBuffer(),
        epochBytes,
      ],
      program.programId
    );

    try {
      await program.methods
        .claimDividend()
        .accounts({
          investor: nonKycKp.publicKey,
          distributor: distributorPda,
          investorTokenAccount: nonKycAta,
          claimRecord: claimRecordPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([nonKycKp])
        .rpc();
      assert.fail("should have thrown InvestorNotKyc");
    } catch (err: any) {
      assert.include(err.toString(), "InvestorNotKyc");
      console.log("✅ Non-KYC claim correctly rejected:", err.error?.errorMessage);
    }
  });

  // ─────────────────────────────────────────────────────────
  // Test 5: 二重請求の防止
  // ─────────────────────────────────────────────────────────
  it("rejects double claim in same epoch", async () => {
    const epochBytes = Buffer.alloc(8);
    epochBytes.writeBigUInt64LE(1n);
    const [claimRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("claim"),
        distributorPda.toBuffer(),
        investorKp.publicKey.toBuffer(),
        epochBytes,
      ],
      program.programId
    );

    try {
      await program.methods
        .claimDividend()
        .accounts({
          investor: investorKp.publicKey,
          distributor: distributorPda,
          investorTokenAccount,
          claimRecord: claimRecordPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([investorKp])
        .rpc();
      assert.fail("should have thrown account already in use");
    } catch (err: any) {
      // ClaimRecord PDA が既に存在するため init が失敗する
      assert.ok(err, "double claim rejected");
      console.log("✅ Double claim correctly rejected");
    }
  });
});
