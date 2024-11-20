export const API_URLS = {
  BASE_HOST: "https://gamma-api.goosefx.io",
  /** id: string */
  CONFIG: "/config",
  /** ids: idList.join(',') */
  POOL_BY_IDS: "/pool/info/ids",
  /**
   * poolType?: { 'hyper' | 'primary' | 'all' }. defaults to 'all'
   * sortOrder?: { 'asc' | 'desc' }. defaults to 'desc'
   * sortBy?: { 'liquidity' | 'volume_24h' / 7d / 30d | 'fee_24h' / 7d / 30d | 'apr_24h' / 7d / 30d }. 
   * pageSize?. { number } defaults to 200
   * page?: { number } defaults to 1
   * search: { string | undefined }
   * mint1: string
   * mint2?: string
   */
  POOL_BY_MINTS: "/pool/info/mints",
   /**
   * poolType?: { 'hyper' | 'primary' | 'all' }. defaults to 'all'
   * sortOrder?: { 'asc' | 'desc' }. defaults to 'desc'
   * sortBy?: { 'liquidity' | 'volume_24h' / 7d / 30d | 'fee_24h' / 7d / 30d | 'apr_24h' / 7d / 30d }. 
   * pageSize?. { number } defaults to 200
   * page?: { number } defaults to 1
   * search: { string | undefined }
   */
  POOL_LIST: "/pool/info/all",
  /** ids: idList.join(',') */
  POOL_KEYS_BY_IDS: "/pool/keys/ids",
  TOKEN_LIST: "/token-list",
  JUP_TOKEN_LIST: "https://api.jup.ag/tokens/v1?tags=lst,community"
};

export const DEV_API_URLS = {
  ...API_URLS,
};

export type API_URL_CONFIG = Partial<typeof API_URLS>;
