export type ConfigInfo = {
  id: string;
  index: number;
  protocolFeeRate: number;
  tradeFeeRate: number;
  fundFeeRate: number;
  createPoolFee: string;
  protocolOwner: string;
  fundOwner: string;
}

export type FetchPoolParams = {
  poolType?: PoolType;
  sortOrder?: SortOrder;
  sortBy?: SortBy;
  pageSize?: number;
  page?: number;
  search?: string;
}

type PoolType = 'all' | 'hyper' | 'primary'
type SortOrder = 'asc' | 'desc'
type SortBy = 'liquidity' | 'volume30d' | 'volume24h' | 'volume7d' | 'fee30d' | 'fee24h' | 'fee7d' | 'apr30d' | 'apr24h' | 'apr7d'

export type PoolKeys = {
  programId: string;
  id: string;
  mintA: string;
  mintB: string;
  openTime: string;
  mintAVault: string;
  mintBVault: string;
  authority: string;
  config: ConfigInfo,
  poolType: PoolType,
  mintAProgram: string;
  mintBProgram: string;
}

export type PoolInfo = {
  programId: string;
  id: string;
  mintA: GammaToken;
  mintB: GammaToken;
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
    daily: PoolStats,
    weekly: PoolStats,
    monthly: PoolStats
  }
}

export type PoolStats = {
  range: '24H' | '7D' | '30D';
  feesUSD: number;
  volumeTokenAUSD: number;
  volumeTokenBUSD: number;
  feesAprUSD: number;
  volumeAprUSD: number;
}

export type PaginatedPoolInfos = {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  count: number;
  pools: PoolInfo[];
}

export enum PoolFetchTypeEnum {
  All = 'all',
  Hyper = 'hyper',
  Primary = 'primary',
}

export type GammaToken = {
  address: string
  name: string
  symbol: string
  decimals: number
  logoURI: string
  tags: string[]
  // dailyVolume: number | null
  // freezeAuthority: string | null
  // mintAuthority: string | null
  // price: number
  extensions?: ExtensionsItem | null
}

export type JupiterListToken = {
  address: string
  name: string
  symbol: string
  decimals: number
  logoURI: string
  tags: string[] // "hasFreeze" | "hasTransferFee" | "token-2022" | "community" | "unknown" ..etc
  // daily_volume: number | null
  // freeze_authority: string | null
  // mint_authority: string | null
  // minted_at: string
  // created_at: string
  // permanent_delegate: string | null
  extensions: ExtensionsItem;
};

type ExtensionsItem = {
  coingeckoId?: string
  feeConfig?: TransferFeeDataBaseType
}

export interface TransferFeeDataBaseType {
  transferFeeConfigAuthority: string
  withdrawWithheldAuthority: string
  withheldAmount: string
  olderTransferFee: {
    epoch: string
    maximumFee: string
    transferFeeBasisPoints: number
  }
  newerTransferFee: {
    epoch: string
    maximumFee: string
    transferFeeBasisPoints: number
  }
}