import { EpochInfo, PublicKey } from "@solana/web3.js";
import { ConfigInfo, PoolInfo, PoolKeys } from "@/api/type";
import { TxVersion } from "@/common/txTool/txType";
import BN from "bn.js";
import { ComputeBudgetConfig, GetTransferAmountFee } from "@/gfx/type";
import { SwapResult } from "./curve/calculator";
import { Percent } from "@/module";
import { Gamma } from "../idl/gamma.type";
import Decimal from "decimal.js";
import { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";

interface MintInfo {
  address: string;
  decimals: number;
  programId: string;
}

export interface CreateCpmmPoolParam<T> {
  programId: PublicKey;
  poolFeeAccount: PublicKey;
  mintA: MintInfo;
  mintB: MintInfo;
  mintAAmount: BN;
  mintBAmount: BN;
  startTime: BN;
  maxTradeFeeRate: BN;
  volatilityFactor: BN;
  feeConfig: ConfigInfo;

  associatedOnly: boolean;
  checkCreateATAOwner?: boolean;

  ownerInfo: {
    feePayer?: PublicKey;
    useSOLBalance?: boolean; // if has WSOL mint
  };
  computeBudgetConfig?: ComputeBudgetConfig;
  txVersion?: T;
}

export interface CreateCpmmPoolAddress {
  poolId: PublicKey;
  configId: PublicKey;
  authority: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
  mintA: MintInfo;
  mintB: MintInfo;
  programId: PublicKey;
  poolFeeAccount: PublicKey;
  feeConfig: ConfigInfo;
}

export interface AddCpmmLiquidityParams<T = TxVersion.LEGACY> {
  poolInfo: PoolInfo;
  poolKeys?: PoolKeys;
  payer?: PublicKey;
  inputAmount: BN;
  baseIn: boolean;
  slippage: Percent;
  config?: {
    bypassAssociatedCheck?: boolean;
    checkCreateATAOwner?: boolean;
  };
  computeBudgetConfig?: ComputeBudgetConfig;
  txVersion?: T;
  computeResult?: {
    inputAmountFee: GetTransferAmountFee;
    anotherAmount: GetTransferAmountFee;
    maxAnotherAmount: GetTransferAmountFee;
    liquidity: BN;
  };
  partner?: PublicKey;
}

export interface WithdrawCpmmLiquidityParams<T = TxVersion.LEGACY> {
  poolInfo: PoolInfo;
  poolKeys?: PoolKeys;
  payer?: PublicKey;
  lpAmount: BN;
  slippage: Percent;
  computeBudgetConfig?: ComputeBudgetConfig;
  txVersion?: T;
}

export interface CpmmSwapWithOracleParams<T = TxVersion.LEGACY> {
  poolInfo: PoolInfo;
  poolKeys?: PoolKeys;
  payer?: PublicKey;
  zeroForOne: boolean;
  slippage?: number;
  swapResult: Pick<SwapResult, "sourceAmountSwapped" | "destinationAmountSwapped">;
  inputAmount: BN;

  config?: {
    bypassAssociatedCheck?: boolean;
    checkCreateATAOwner?: boolean;
    associatedOnly?: boolean;
  };
  computeBudgetConfig?: ComputeBudgetConfig;
  txVersion?: T;
  wrapSol?: boolean;
  dflowSegmenterOptions?: {
    registeredSegmenter: PublicKey;
    registeredRegistry: PublicKey;
  } | null;
  referralAccounts?: {
    referralAccount: PublicKey;
    referralTokenAccountWithInputMint: PublicKey;
  } | null;
}

export interface CpmmSwapParams<T = TxVersion.LEGACY> extends CpmmSwapWithOracleParams<T> {
  baseIn?: boolean;
}

export interface ComputePairAmountParams {
  poolInfo: PoolInfo;
  baseReserve: BN;
  quoteReserve: BN;
  amount: string | Decimal;
  slippage: Percent;
  epochInfo: EpochInfo;
  baseIn?: boolean;
}

export type CpmmObservationState = IdlAccounts<Gamma>["observationState"];
export type CpmmConfig = IdlAccounts<Gamma>["ammConfig"];
export type CpmmPool = IdlAccounts<Gamma>["poolState"];
export type CpmmPoolPartners = IdlAccounts<Gamma>["poolPartnerInfos"];
export type CpmmRewardInfo = IdlAccounts<Gamma>["rewardInfo"];
export type CpmmUserLiquidityAccount = IdlAccounts<Gamma>["userPoolLiquidity"];
export type CpmmUserRewardInfo = IdlAccounts<Gamma>["userRewardInfo"];
export type CpmmObservation = IdlTypes<Gamma>["observation"];
export type UserLiquidityAccount = IdlAccounts<Gamma>["userPoolLiquidity"];

export enum CpmmCoder {
  CPMM_POOL = "poolState",
  CPMM_POOL_PARTNERS = "poolPartnerInfos",
}

export type CpmmRpcData = CpmmPool & {
  baseReserve: BN;
  quoteReserve: BN;
  vaultAAmount: BN;
  vaultBAmount: BN;
  configInfo?: CpmmConfig;
  partnerInfo: CpmmPoolPartners;
  observationAccount: CpmmObservationState;
  poolPrice: Decimal;
  programId: PublicKey;
};

export type CpmmComputeData = {
  id: PublicKey;
  version: 7;
  configInfo: CpmmConfig;
  mintA: MintInfo;
  mintB: MintInfo;
  authority: PublicKey;
} & Omit<CpmmRpcData, "configInfo" | "mintA" | "mintB">;
