/** ====== Types ======= */
export interface ApiConfig {
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  fundFeeRate: number;
  createPoolFee: string;
}

export interface ApiPaginatedPools {
  count: number;
  hasNextPage: boolean;
  data: ApiPool[];
}

export interface ApiPool {
  programId: string;
  id: string;
  mintA: ApiV3Token;
  mintB: ApiV3Token;
  price: number;
  mintAmountA: number;
  mintAmountB: number;
  feeRate: number;
  openTime: string;
  tvl: number;

  poolStats24H: ApiPoolStats;
  poolStats7D: ApiPoolStats;
  poolStats30D: ApiPoolStats;

  lpMint: ApiV3Token;
  lpPrice: number;
  lpAmount: number;
  config: ApiConfig;
}
export interface ApiPoolStats {
  fees: number,
  volume: number,
  feesApr: number,
}

export enum PoolFetchType {
  All = "all",
  Primary = "primary",
  Hyper = "hyper"
}

export interface FetchPoolParams {
  type?: PoolFetchType;
  sort?:
    | "liquidity"
    | "volume24h"
    | "fee24h"
    | "fee30d"
    | "apr24h"
    | "apr7d"
    | "apr30d";
  order?: "desc" | "asc";
  pageSize?: number;
  page?: number;
}
export interface ApiPoolKeys {
  programId: string;
  id: string;
  mintA: ApiV3Token;
  mintB: ApiV3Token;
  lookupTableAccount?: string;
  openTime: string;
  vault: { A: string; B: string };
  authority: string;
  mintLp: ApiV3Token;
  config: ApiConfig;
}
/** ====== token types ======= */
export type ApiV3Token = {
  chainId: number;
  address: string;
  programId: string;
  logoURI: string;
  symbol: string;
  name: string;
  decimals: number;
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
/** ========================== */