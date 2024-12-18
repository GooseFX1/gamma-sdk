import { EpochInfo, PublicKey } from "@solana/web3.js";
import { ConfigInfo, PoolInfo, GammaToken, PoolKeys } from "@/api/type";
import { TxVersion } from "@/common/txTool/txType";
import BN from "bn.js";
import { ComputeBudgetConfig, GetTransferAmountFee } from "@/gfx/type";
import { SwapResult } from "./curve/calculator";
import { Percent } from "@/module";
import { CpmmObservationStateLayout, CpmmPoolInfoLayout, CpmmUserPoolLiquidityLayout, ObservationLayout } from "./layout";
import Decimal from "decimal.js";

interface MintInfo {
  address: string;
  decimals: number;
  programId: string;
}

export interface CpmmConfigInfoInterface {
  bump: number;
  disableCreatePool: boolean;
  index: number;
  tradeFeeRate: BN;
  protocolFeeRate: BN;
  fundFeeRate: BN;
  createPoolFee: BN;

  protocolOwner: PublicKey;
  fundOwner: PublicKey;
}

export interface CpmmPoolInfoInterface {
  configId: PublicKey;
  poolCreator: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;

  mintLp: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;

  mintProgramA: PublicKey;
  mintProgramB: PublicKey;

  observationId: PublicKey;

  bump: number;
  status: number;

  lpDecimals: number;
  mintDecimalA: number;
  mintDecimalB: number;

  lpAmount: BN;
  protocolFeesMintA: BN;
  protocolFeesMintB: BN;
  fundFeesMintA: BN;
  fundFeesMintB: BN;
  openTime: BN;
  recentEpoch: BN,
  tradeFeesTokenA: BN,
  tradeFeesTokenB: BN,
  cumulativeVolumeTokenA: BN,
  cumulativeVolumeTokenB: BN
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

export enum PartnerType {
  AssetDash = 'AssetDash'
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
  partner?: PartnerType
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

export interface CpmmSwapParams<T = TxVersion.LEGACY> {
  poolInfo: PoolInfo;
  poolKeys?: PoolKeys;
  payer?: PublicKey;
  baseIn: boolean;
  fixedOut?: boolean;
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

export type CpmmRpcData = ReturnType<typeof CpmmPoolInfoLayout.decode> & {
  baseReserve: BN;
  quoteReserve: BN;
  vaultAAmount: BN;
  vaultBAmount: BN;
  configInfo?: CpmmConfigInfoInterface;
  poolPrice: Decimal;
  programId: PublicKey;
};

export type CpmmComputeData = {
  id: PublicKey;
  version: 7;
  configInfo: CpmmConfigInfoInterface;
  mintA: MintInfo;
  mintB: MintInfo;
  authority: PublicKey;
} & Omit<CpmmRpcData, "configInfo" | "mintA" | "mintB">;

export type CpmmObservation = ReturnType<typeof ObservationLayout.decode>
export type CpmmObservationState = ReturnType<typeof CpmmObservationStateLayout.decode>
export type UserLiquidityAccount = ReturnType<typeof CpmmUserPoolLiquidityLayout.decode>