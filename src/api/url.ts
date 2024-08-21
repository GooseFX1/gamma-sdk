export const API_URLS = {
  BASE_HOST: "https://amm-api.goose-fx.io",
  CPMM_CONFIG: "/main/config",
  VERSION: "/main/version",

  // api 
  MINT_INFO_ID: "/mint/ids",
  JUP_TOKEN_LIST: "https://tokens.jup.ag/tokens?tags=lst,community",
  /**
   * poolType: {Hyper, Primary}
   * poolSortField: {liquidity | volume_24h / 7d / 30d | fee_24h / 7d / 30d | apr_24h / 7d / 30d}
   * sortType: {desc/asc}
   * page: number
   * pageSize: number
   */
  POOL_LIST: "/pools/info/list",
  /**
   * ?ids=idList.join(',')
   */
  POOL_SEARCH_BY_ID: "/pools/info/ids",
  /**
   * mint1/mint2: search pool by mint
   * poolSortField: {liquidity | volume_24h / 7d / 30d | fee_24h / 7d / 30d | apr_24h / 7d / 30d}
   * poolType: {Hyper, Primary}
   * sortType: {desc/asc}
   * page: number
   * pageSize: number
   */
  POOL_SEARCH_MINT: "/pools/info/mint",
  /** ?lps=lpList.join(',') */
  POOL_SEARCH_LP: "/pools/info/lps",
  /** ?ids=idList.join(',') */
  POOL_KEY_BY_ID: "/pools/key/ids",
};

export const DEV_API_URLS = {
  ...API_URLS,
};

export type API_URL_CONFIG = Partial<typeof API_URLS>;
