import { AccountInfo } from "@solana/web3.js";

export type ConfigInfo = {
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  fundFeeRate: number;
  createPoolFee: string;
  protocolOwner: string;
  fundOwner: string;
};

export type FetchPoolParams = {
  poolType?: PoolType;
  sortOrder?: SortOrder;
  sortBy?: SortBy;
  pageSize?: number;
  page?: number;
  search?: string;
};

type PoolType = "all" | "hyper" | "primary";
type SortOrder = "asc" | "desc";
type SortBy =
  | "liquidity"
  | "volume30d"
  | "volume24h"
  | "volume7d"
  | "fee30d"
  | "fee24h"
  | "fee7d"
  | "apr30d"
  | "apr24h"
  | "apr7d";

export type PoolKeys = {
  programId: string;
  id: string;
  mintA: string;
  mintB: string;
  openTime: string;
  mintAVault: string;
  mintBVault: string;
  authority: string;
  config: ConfigInfo;
  poolType: PoolType;
  mintAProgram: string;
  mintBProgram: string;
};

export type PartnerInfo = {
  address: string;
  name: string;
  authority: string;
  token0TokenAccount: string;
  token1TokenAccount: string;
};

type BasePoolInfo<T extends GammaToken> = {
  programId: string;
  id: string;
  mintA: T;
  mintB: T;
  openTime: string;
  mintAVault: string;
  mintBVault: string;
  authority: string;
  config: ConfigInfo;
  poolType: PoolType;
  price: string | null;
  tvl: string | null;
  poolCreator: string;
  liquidityTokenA: string | null;
  liquidityTokenB: string | null;
  lpSupply: string | null;
  stats: {
    daily: PoolStats;
    weekly: PoolStats;
    monthly: PoolStats;
  };
  partners: PartnerInfo[];
  accountInfo: AccountInfo<Buffer>;
};

export type PoolInfo = BasePoolInfo<GammaToken>;
export type ApiPoolInfo = BasePoolInfo<GammaApiToken>;

export type PoolStats = {
  range: "24H" | "7D" | "30D";
  feesUsd: number;
  volumeTokenAUsd: number;
  volumeTokenBUsd: number;
  feesAprUsd: number;
  volumeAprUsd: number;
  withdrawnKaminoProfitTokenAUsd: number;
  withdrawnKaminoProfitTokenBUsd: number;
  withdrawnKaminoProfitTokenAAprUsd: number;
  withdrawnKaminoProfitTokenBAprUsd: number;
};

export type PaginatedPoolInfos = {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  count: number;
  pools: ApiPoolInfo[];
};

export enum PoolFetchTypeEnum {
  All = "all",
  Hyper = "hyper",
  Primary = "primary",
}

export type GammaToken = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags?: string[];
  extensions?: ExtensionsItem | null;
};

export type GammaApiToken = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  dailyVolume: number | null;
  freezeAuthority: string | null;
  mintAuthority: string | null;
  extensions: ExtensionsItem | null;
  cumulativeTradeFees: string | null;
  withdrawnKaminoProfit: string | null;
  protocolFees: string | null;
  fundFees: string | null;
};

export type JupiterListToken = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags: string[]; // "hasFreeze" | "hasTransferFee" | "token-2022" | "community" | "unknown" ..etc
  extensions: ExtensionsItem;
};

type ExtensionsItem = {
  coingeckoId?: string;
  feeConfig?: TransferFeeDataBaseType;
};

export interface TransferFeeDataBaseType {
  transferFeeConfigAuthority: string;
  withdrawWithheldAuthority: string;
  withheldAmount: string;
  olderTransferFee: {
    epoch: string;
    maximumFee: string;
    transferFeeBasisPoints: number;
  };
  newerTransferFee: {
    epoch: string;
    maximumFee: string;
    transferFeeBasisPoints: number;
  };
}
