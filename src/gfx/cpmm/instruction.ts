import BN from "bn.js";

import { AccountMeta, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID, RENT_PROGRAM_ID, MEMO_PROGRAM_ID2, createLogger } from "@/common";

import { struct, u64, option, str } from "@/marshmallow";
import { PartnerType } from "./type";
const logger = createLogger("Gfx_cpmm");
const anchorDataBuf = {
  initUserLiquidity: [227, 221, 200, 212, 36, 107, 149, 36],
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  swapBaseInput: [143, 190, 90, 218, 196, 30, 51, 222],
  swapBaseOutput: [55, 217, 98, 86, 163, 74, 180, 173],
};

export function makeInitUserPoolLiquidityInstruction(
  programId: PublicKey,
  user: PublicKey,
  poolId: PublicKey,
  userPoolLiquidity: PublicKey,
  globalUserLpRecentChange: PublicKey,
  partner: PartnerType | null,
): TransactionInstruction {
  const dataLayout = struct([option(str(), "partner")]);

  const keys: Array<AccountMeta> = [
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userPoolLiquidity, isSigner: false, isWritable: true },
    { pubkey: globalUserLpRecentChange, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // `dataLayout.getSpan` returns -1 before the encoding, which causes an error during allocation.
  // we first allocate a buffer of 'random' length, after which we can perform the encoding and then
  // get the correct span. The resulting buffer is truncated to match the span
  const data = Buffer.alloc(100);
  dataLayout.encode(
    {
      partner,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.initUserLiquidity, ...data.slice(0, dataLayout.getSpan(data))]),
  });
}

export function makeCreateCpmmPoolInInstruction(
  programId: PublicKey,
  creator: PublicKey,
  configId: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  userPoolLiquidity: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  createPoolFeeAccount: PublicKey,
  mintProgramA: PublicKey,
  mintProgramB: PublicKey,
  observationId: PublicKey,
  amountMaxA: BN,
  amountMaxB: BN,
  openTime: BN,
  maxTradeFeeRate: BN,
  volatilityFactor: BN,
  globalRewardInfo: PublicKey,
  globalUserLpRecentChange: PublicKey,
): TransactionInstruction {
  const dataLayout = struct([
    u64("amountMaxA"),
    u64("amountMaxB"),
    u64("openTime"),
    u64("maxTradeFeeRate"),
    u64("volatilityFactor"),
  ]);

  const keys: Array<AccountMeta> = [
    { pubkey: creator, isSigner: true, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userPoolLiquidity, isSigner: false, isWritable: true },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: userVaultA, isSigner: false, isWritable: true },
    { pubkey: userVaultB, isSigner: false, isWritable: true },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: createPoolFeeAccount, isSigner: false, isWritable: true },
    { pubkey: observationId, isSigner: false, isWritable: true },
    { pubkey: globalRewardInfo, isSigner: false, isWritable: true },
    { pubkey: globalUserLpRecentChange, isSigner: false, isWritable: true },

    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintProgramA, isSigner: false, isWritable: false },
    { pubkey: mintProgramB, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountMaxA,
      amountMaxB,
      openTime,
      maxTradeFeeRate,
      volatilityFactor,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.initialize, ...data]),
  });
}

export function makeDepositCpmmInInstruction(
  programId: PublicKey,
  owner: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  userLiquidityAccount: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  globalRewardInfo: PublicKey,
  globalUserLpRecentChange: PublicKey,
  lpAmount: BN,
  amountMaxA: BN,
  amountMaxB: BN,
): TransactionInstruction {
  const dataLayout = struct([u64("lpAmount"), u64("amountMaxA"), u64("amountMaxB")]);

  const keys: Array<AccountMeta> = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userLiquidityAccount, isSigner: false, isWritable: true },
    { pubkey: userVaultA, isSigner: false, isWritable: true },
    { pubkey: userVaultB, isSigner: false, isWritable: true },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: globalRewardInfo, isSigner: false, isWritable: true },
    { pubkey: globalUserLpRecentChange, isSigner: false, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const data = Buffer.alloc(dataLayout.span);
  logger.debug("cpmm deposit data", {
    lpAmount: lpAmount.toString(),
    amountMaxA: amountMaxA.toString(),
    amountMaxB: amountMaxB.toString(),
  });
  dataLayout.encode(
    {
      lpAmount,
      amountMaxA,
      amountMaxB,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.deposit, ...data]),
  });
}

export function makeWithdrawCpmmInInstruction(
  programId: PublicKey,
  owner: PublicKey,
  authority: PublicKey,
  poolId: PublicKey,
  userLiquidityAccount: PublicKey,
  userVaultA: PublicKey,
  userVaultB: PublicKey,
  vaultA: PublicKey,
  vaultB: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  globalRewardInfo: PublicKey,
  globalUserLpRecentChange: PublicKey,
  lpAmount: BN,
  amountMintA: BN,
  amountMintB: BN,
): TransactionInstruction {
  const dataLayout = struct([u64("lpAmount"), u64("amountMintA"), u64("amountMintB")]);

  const keys: Array<AccountMeta> = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userLiquidityAccount, isSigner: false, isWritable: true },
    { pubkey: userVaultA, isSigner: false, isWritable: true },
    { pubkey: userVaultB, isSigner: false, isWritable: true },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: mintA, isSigner: false, isWritable: false },
    { pubkey: mintB, isSigner: false, isWritable: false },
    { pubkey: MEMO_PROGRAM_ID2, isSigner: false, isWritable: false },
    { pubkey: globalRewardInfo, isSigner: false, isWritable: true },
    { pubkey: globalUserLpRecentChange, isSigner: false, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      lpAmount,
      amountMintA,
      amountMintB,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.withdraw, ...data]),
  });
}

export function makeSwapCpmmBaseInInInstruction(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountIn: BN,
  amounOutMin: BN,
  dflowSegmenterOptions: {
    registeredSegmenter: PublicKey;
    registeredRegistry: PublicKey;
  } | null = null,
  referralAccounts: {
    referralAccount: PublicKey;
    referralTokenAccountWithInputMint: PublicKey;
  } | null = null,
): TransactionInstruction {
  const dataLayout = struct([u64("amountIn"), u64("amounOutMin")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userInputAccount, isSigner: false, isWritable: true },
    { pubkey: userOutputAccount, isSigner: false, isWritable: true },
    { pubkey: inputVault, isSigner: false, isWritable: true },
    { pubkey: outputVault, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];
  if (dflowSegmenterOptions) {
    keys.push({ pubkey: dflowSegmenterOptions.registeredSegmenter, isSigner: true, isWritable: false });
    keys.push({ pubkey: dflowSegmenterOptions.registeredRegistry, isSigner: false, isWritable: false });
  }

  if (referralAccounts) {
    if (!dflowSegmenterOptions) {
      // We pass programId as then the program will interpret them as None, i.e not passed
      // The smart contract requires the accounts to be in specific order by doing this we still follow the order but
      // the program will interpret them as not passed
      keys.push({ pubkey: programId, isSigner: false, isWritable: false });
      keys.push({ pubkey: programId, isSigner: false, isWritable: false });
    }

    keys.push({ pubkey: referralAccounts.referralAccount, isSigner: false, isWritable: false });
    keys.push({ pubkey: referralAccounts.referralTokenAccountWithInputMint, isSigner: false, isWritable: true });
  }

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountIn,
      amounOutMin,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseInput, ...data]),
  });
}

export function makeSwapCpmmBaseOutInInstruction(
  programId: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  configId: PublicKey,
  poolId: PublicKey,
  userInputAccount: PublicKey,
  userOutputAccount: PublicKey,
  inputVault: PublicKey,
  outputVault: PublicKey,
  inputTokenProgram: PublicKey,
  outputTokenProgram: PublicKey,
  inputMint: PublicKey,
  outputMint: PublicKey,
  observationId: PublicKey,

  amountInMax: BN,
  amountOut: BN,
  dflowSegmenterOptions: {
    registeredSegmenter: PublicKey;
    registeredRegistry: PublicKey;
  } | null = null,
  referralAccounts: {
    referralAccount: PublicKey;
    referralTokenAccountWithInputMint: PublicKey;
  } | null = null,
): TransactionInstruction {
  const dataLayout = struct([u64("amountInMax"), u64("amountOut")]);

  const keys: Array<AccountMeta> = [
    { pubkey: payer, isSigner: true, isWritable: false },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: configId, isSigner: false, isWritable: false },
    { pubkey: poolId, isSigner: false, isWritable: true },
    { pubkey: userInputAccount, isSigner: false, isWritable: true },
    { pubkey: userOutputAccount, isSigner: false, isWritable: true },
    { pubkey: inputVault, isSigner: false, isWritable: true },
    { pubkey: outputVault, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationId, isSigner: false, isWritable: true },
  ];
  if (dflowSegmenterOptions) {
    keys.push({ pubkey: dflowSegmenterOptions.registeredSegmenter, isSigner: true, isWritable: false });
    keys.push({ pubkey: dflowSegmenterOptions.registeredRegistry, isSigner: false, isWritable: false });
  }

  if (referralAccounts) {
    if (!dflowSegmenterOptions) {
      // We pass programId as then the program will interpret them as None, i.e not passed
      // The smart contract requires the accounts to be in specific order by doing this we still follow the order but
      // the program will interpret them as not passed
      keys.push({ pubkey: programId, isSigner: false, isWritable: false });
      keys.push({ pubkey: programId, isSigner: false, isWritable: false });
    }

    keys.push({ pubkey: referralAccounts.referralAccount, isSigner: false, isWritable: false });
    keys.push({ pubkey: referralAccounts.referralTokenAccountWithInputMint, isSigner: false, isWritable: true });
  }

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      amountInMax,
      amountOut,
    },
    data,
  );

  return new TransactionInstruction({
    keys,
    programId,
    data: Buffer.from([...anchorDataBuf.swapBaseOutput, ...data]),
  });
}
