import BN from "bn.js";

import { Program } from "@coral-xyz/anchor";
import { AccountMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createLogger } from "@/common";
import { Gamma } from "../idl/gamma.type";

const logger = createLogger("Gfx_cpmm");

type DflowSegmenterParams = {
  registeredSegmenter: PublicKey;
  registeredRegistry: PublicKey;
};
type ReferralParams = {
  referralAccount: PublicKey;
  referralTokenAccountWithInputMint: PublicKey;
};

export async function makeInitUserPoolLiquidityInstruction(
  program: Program<Gamma>,
  user: PublicKey,
  poolState: PublicKey,
  partner: PublicKey | null,
): Promise<TransactionInstruction> {
  return await program.methods
    .initUserPoolLiquidity(partner)
    .accounts({
      user,
      poolState,
    })
    .instruction();
}

export async function makeCreateCpmmPoolInInstruction(
  program: Program<Gamma>,
  creator: PublicKey,
  ammConfig: PublicKey,
  token0Mint: PublicKey,
  token1Mint: PublicKey,
  creatorToken0: PublicKey,
  creatorToken1: PublicKey,
  token0Program: PublicKey,
  token1Program: PublicKey,
  amountMaxA: BN,
  amountMaxB: BN,
  openTime: BN,
  maxTradeFeeRate: BN,
  volatilityFactor: BN,
): Promise<TransactionInstruction> {
  return await program.methods
    .initialize(amountMaxA, amountMaxB, openTime, maxTradeFeeRate, volatilityFactor)
    .accounts({
      creator,
      ammConfig,
      token0Mint,
      token1Mint,
      creatorToken0,
      creatorToken1,
      token0Program,
      token1Program,
    })
    .instruction();
}

export async function makeDepositCpmmInInstruction(
  program: Program<Gamma>,
  owner: PublicKey,
  poolState: PublicKey,
  token0Account: PublicKey,
  token1Account: PublicKey,
  token0Vault: PublicKey,
  token1Vault: PublicKey,
  vault0Mint: PublicKey,
  vault1Mint: PublicKey,
  lpAmount: BN,
  amountMaxA: BN,
  amountMaxB: BN,
): Promise<TransactionInstruction> {
  logger.debug("cpmm deposit data", {
    lpAmount: lpAmount.toString(),
    amountMaxA: amountMaxA.toString(),
    amountMaxB: amountMaxB.toString(),
  });

  return await program.methods
    .deposit(lpAmount, amountMaxA, amountMaxB)
    .accounts({
      owner,
      poolState,
      token0Account,
      token1Account,
      token0Vault,
      token1Vault,
      vault0Mint,
      vault1Mint,
    })
    .instruction();
}

export async function makeWithdrawCpmmInInstruction(
  program: Program<Gamma>,
  owner: PublicKey,
  poolState: PublicKey,
  token0Account: PublicKey,
  token1Account: PublicKey,
  token0Vault: PublicKey,
  token1Vault: PublicKey,
  vault0Mint: PublicKey,
  vault1Mint: PublicKey,
  lpAmount: BN,
  amountMintA: BN,
  amountMintB: BN,
  kaminoAccounts?: AccountMeta[],
): Promise<TransactionInstruction> {
  return await program.methods
    .withdraw(lpAmount, amountMintA, amountMintB)
    .accounts({
      owner,
      poolState,
      token0Account,
      token1Account,
      token0Vault,
      token1Vault,
      vault0Mint,
      vault1Mint,
    })
    .remainingAccounts(kaminoAccounts ?? [])
    .instruction();
}

export async function makeSwapCpmmBaseInInstruction(
  program: Program<Gamma>,
  payer: PublicKey,
  ammConfig: PublicKey,
  poolState: PublicKey,
  inputTokenAccount: PublicKey,
  outputTokenAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  observationState: PublicKey,

  amountIn: BN,
  amounOutMin: BN,
  dflowSegmenterOptions: DflowSegmenterParams | null = null,
  referralAccounts: ReferralParams | null = null,
): Promise<TransactionInstruction> {
  let remainingAccounts = swapRemainingAccounts(program.programId, dflowSegmenterOptions, referralAccounts);
  return await program.methods
    .swapBaseInput(amountIn, amounOutMin)
    .accounts({
      payer,
      ammConfig,
      poolState,
      inputTokenAccount,
      outputTokenAccount,
      inputTokenMint,
      outputTokenMint,
      inputTokenProgram,
      outputTokenProgram,
      inputVault,
      outputVault,
      observationState,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
}

export async function makeSwapCpmmBaseOutInstruction(
  program: Program<Gamma>,
  payer: PublicKey,
  ammConfig: PublicKey,
  poolState: PublicKey,
  inputTokenAccount: PublicKey,
  outputTokenAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  observationState: PublicKey,

  amountInMax: BN,
  amounOut: BN,
  dflowSegmenterOptions: DflowSegmenterParams | null = null,
  referralAccounts: ReferralParams | null = null,
): Promise<TransactionInstruction> {
  let remainingAccounts = swapRemainingAccounts(program.programId, dflowSegmenterOptions, referralAccounts);
  return await program.methods
    .swapBaseOutput(amountInMax, amounOut)
    .accounts({
      payer,
      ammConfig,
      poolState,
      inputTokenAccount,
      outputTokenAccount,
      inputTokenMint,
      outputTokenMint,
      inputTokenProgram,
      outputTokenProgram,
      inputVault,
      outputVault,
      observationState,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
}

export async function makeSwapCpmmOracleBaseInInstruction(
  program: Program<Gamma>,
  payer: PublicKey,
  ammConfig: PublicKey,
  poolState: PublicKey,
  inputTokenAccount: PublicKey,
  outputTokenAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputTokenMint: PublicKey,
  outputTokenMint: PublicKey,
  observationState: PublicKey,

  amountIn: BN,
  amounOutMin: BN,
  dflowSegmenterOptions: DflowSegmenterParams | null = null,
  referralAccounts: ReferralParams | null = null,
): Promise<TransactionInstruction> {
  let remainingAccounts = swapRemainingAccounts(program.programId, dflowSegmenterOptions, referralAccounts);
  return await program.methods
    .oracleBasedSwapBaseInput(amountIn, amounOutMin)
    .accounts({
      payer,
      ammConfig,
      poolState,
      inputTokenAccount,
      outputTokenAccount,
      inputTokenMint,
      outputTokenMint,
      inputTokenProgram,
      outputTokenProgram,
      inputVault,
      outputVault,
      observationState,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
}

export async function makeCreateRewardsInstruction(
  program: Program<Gamma>,
  rewardProvider: PublicKey,
  poolState: PublicKey,
  rewardProvidersTokenAccount: PublicKey,
  rewardMint: PublicKey,
  startTime: BN,
  endTime: BN,
  rewardAmount: BN,
): Promise<TransactionInstruction> {
  return await program.methods
    .createRewards(startTime, endTime, rewardAmount)
    .accounts({
      rewardProvider,
      poolState,
      rewardProvidersTokenAccount,
      rewardMint,
    })
    .instruction();
}

export async function makeClaimRewardsInstruction(
  program: Program<Gamma>,
  user: PublicKey,
  poolState: PublicKey,
  userTokenAccount: PublicKey,
  rewardMint: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .claimRewards()
    .accounts({
      user,
      poolState,
      userTokenAccount,
      rewardMint,
    })
    .instruction();
}

export async function makeCalculateRewardsInstruction(
  program: Program<Gamma>,
  signer: PublicKey,
  user: PublicKey,
  poolState: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .calculateRewards()
    .accounts({
      signer,
      user,
      poolState,
    })
    .instruction();
}

export async function makeInitializePartnerInstruction(
  program: Program<Gamma>,
  payer: PublicKey,
  authority: PublicKey,
  poolState: PublicKey,
  partner: PublicKey,
  name: string,
  token0TokenAccount: PublicKey,
  token1TokenAccount: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .initializePartner(name, token0TokenAccount, token1TokenAccount)
    .accounts({
      payer,
      authority,
      poolState,
      partner,
    })
    .instruction();
}

export async function makeUpdatePartnerInstruction(
  program: Program<Gamma>,
  authority: PublicKey,
  partner: PublicKey,
  token0TokenAccount?: PublicKey,
  token1TokenAccount?: PublicKey,
): Promise<TransactionInstruction> {
  if (!token0TokenAccount && !token1TokenAccount) {
    throw new Error(`No params specified for partner update`);
  }
  return await program.methods
    .updatePartner(token0TokenAccount ?? null, token1TokenAccount ?? null)
    .accountsStrict({
      authority,
      partner,
    })
    .instruction();
}

export async function makeAddPartnerInstruction(
  program: Program<Gamma>,
  ammConfig: PublicKey,
  poolState: PublicKey,
  partner: PublicKey,
  authority?: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .addPartner()
    .accountsPartial({
      authority,
      ammConfig,
      poolState,
      partner,
    })
    .instruction();
}

export async function makeCalculatePartnerFeesInstruction(
  program: Program<Gamma>,
  poolState: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .updatePartnerFees()
    .accounts({
      poolState,
    })
    .instruction();
}

export async function makeClaimPartnerFeesInstruction(
  program: Program<Gamma>,
  poolState: PublicKey,
  partner: PublicKey,
  token0Vault: PublicKey,
  token1Vault: PublicKey,
  vault0Mint: PublicKey,
  vault1Mint: PublicKey,
  token0TokenAccount?: PublicKey,
  token1TokenAccount?: PublicKey,
): Promise<TransactionInstruction> {
  return await program.methods
    .claimPartnerFees()
    .accountsPartial({
      poolState,
      partner,
      token0Vault,
      token1Vault,
      vault0Mint,
      vault1Mint,
      token0TokenAccount,
      token1TokenAccount,
    })
    .instruction();
}

function swapRemainingAccounts(
  gammaProgramId: PublicKey,
  dflowSegmenterOptions: DflowSegmenterParams | null,
  referralAccounts: ReferralParams | null,
): AccountMeta[] {
  const keys: Array<AccountMeta> = [];
  if (dflowSegmenterOptions) {
    keys.push({ pubkey: dflowSegmenterOptions.registeredSegmenter, isSigner: true, isWritable: false });
    keys.push({ pubkey: dflowSegmenterOptions.registeredRegistry, isSigner: false, isWritable: false });
  }

  if (referralAccounts) {
    if (!dflowSegmenterOptions) {
      // We pass programId as then the program will interpret them as None, i.e not passed
      // The smart contract requires the accounts to be in specific order by doing this we still follow the order but
      // the program will interpret them as not passed
      keys.push({ pubkey: gammaProgramId, isSigner: false, isWritable: false });
      keys.push({ pubkey: gammaProgramId, isSigner: false, isWritable: false });
    }

    keys.push({ pubkey: referralAccounts.referralAccount, isSigner: false, isWritable: false });
    keys.push({ pubkey: referralAccounts.referralTokenAccountWithInputMint, isSigner: false, isWritable: true });
  }

  return keys;
}
