import axios, { AxiosInstance } from "axios";

import { createLogger, sleep } from "../common";
import { Cluster } from "../solana";

import {
  ApiConfig,
  ApiPaginatedPools,
  ApiPool,
  ApiPoolKeys,
  ApiV3Token,
  FetchPoolParams,
  PoolFetchType,
} from "./type";
import { API_URLS, API_URL_CONFIG } from "./url";
import { updateReqHistory } from "./utils";
import { PublicKey } from "@solana/web3.js";
import { solToWSol } from "../common";

const logger = createLogger("Gfx_Api");
const poolKeysCache: Map<string, ApiPoolKeys> = new Map();

export async function endlessRetry<T>(name: string, call: () => Promise<T>, interval = 1000): Promise<T> {
  let result: T | undefined;

  while (result == undefined) {
    try {
      logger.debug(`Request ${name} through endlessRetry`);
      result = await call();
    } catch (err) {
      logger.error(`Request ${name} failed, retry after ${interval} ms`, err);
      await sleep(interval);
    }
  }

  return result;
}

export interface ApiProps {
  cluster: Cluster;
  timeout: number;
  logRequests?: boolean;
  logCount?: number;
  urlConfigs?: API_URL_CONFIG;
}

export class Api {
  public cluster: Cluster;

  public api: AxiosInstance;
  public logCount: number;

  public urlConfigs: API_URL_CONFIG;

  constructor({ cluster, timeout, logRequests, logCount, urlConfigs }: ApiProps) {
    this.cluster = cluster;
    this.urlConfigs = urlConfigs || {};
    this.logCount = logCount || 1000;

    this.api = axios.create({ baseURL: this.urlConfigs.BASE_HOST || API_URLS.BASE_HOST, timeout });

    this.api.interceptors.request.use(
      (config) => {
        // before request
        const { method, baseURL, url } = config;

        logger.debug(`${method?.toUpperCase()} ${baseURL}${url}`);

        return config;
      },
      (error) => {
        // request error
        logger.error(`Request failed`);

        return Promise.reject(error);
      },
    );
    this.api.interceptors.response.use(
      (response) => {
        // 2xx
        const { config, data, status } = response;
        const { method, baseURL, url } = config;

        if (logRequests) {
          updateReqHistory({
            status,
            url: `${baseURL}${url}`,
            params: config.params,
            data,
            logCount: this.logCount,
          });
        }

        logger.debug(`${method?.toUpperCase()} ${baseURL}${url}  ${status}`);

        return data;
      },
      (error) => {
        // https://axios-http.com/docs/handling_errors
        // not 2xx
        const { config, response = {} } = error;
        const { status } = response;
        const { method, baseURL, url } = config;

        if (logRequests) {
          updateReqHistory({
            status,
            url: `${baseURL}${url}`,
            params: config.params,
            data: error.message,
            logCount: this.logCount,
          });
        }

        logger.error(`${method.toUpperCase()} ${baseURL}${url} ${status || error.message}`);

        return Promise.reject(error);
      },
    );
  }

  async getConfigs(): Promise<ApiConfig[]> {
    const res = await this.api.get(this.urlConfigs.CPMM_CONFIG || API_URLS.CPMM_CONFIG);
    return res.data;
  }

  async getJupTokenList(): Promise<ApiV3Token[]> {
    return this.api.get("", {
      baseURL: this.urlConfigs.JUP_TOKEN_LIST || API_URLS.JUP_TOKEN_LIST,
    });
  }

  async getTokenInfo(mint: (string | PublicKey)[]): Promise<ApiV3Token[]> {
    const res = await this.api.get(
      (this.urlConfigs.MINT_INFO_ID || API_URLS.MINT_INFO_ID) + `?mints=${mint.map((m) => m.toString()).join(",")}`,
    );
    return res.data;
  }

  async getPoolList(props: FetchPoolParams = {}): Promise<ApiPaginatedPools> {
    const { type = "all", sort = "liquidity", order = "desc", page = 0, pageSize = 100 } = props;
    const res = await this.api.get<ApiPaginatedPools>(
      (this.urlConfigs.POOL_LIST || API_URLS.POOL_LIST) +
        `?poolType=${type}&poolSortField=${sort}&sortType=${order}&page=${page}&pageSize=${pageSize}`,
    );
    return res.data;
  }

  async fetchPoolById(props: { ids: string }): Promise<ApiPool[]> {
    const { ids } = props;
    const res = await this.api.get((this.urlConfigs.POOL_SEARCH_BY_ID || API_URLS.POOL_SEARCH_BY_ID) + `?ids=${ids}`);
    return res.data;
  }

  async fetchPoolKeysById(props: { idList: string[] }): Promise<ApiPoolKeys[]> {
    const { idList } = props;

    const cacheList: ApiPoolKeys[] = [];

    const readyList = idList.filter((poolId) => {
      if (poolKeysCache.has(poolId)) {
        cacheList.push(poolKeysCache.get(poolId)!);
        return false;
      }
      return true;
    });

    let data: ApiPoolKeys[] = [];
    if (readyList.length) {
      const res = await this.api.get<ApiPoolKeys[]>(
        (this.urlConfigs.POOL_KEY_BY_ID || API_URLS.POOL_KEY_BY_ID) + `?ids=${readyList.join(",")}`,
      );
      data = res.data.filter(Boolean);
      data.forEach((poolKey) => {
        poolKeysCache.set(poolKey.id, poolKey);
      });
    }

    return cacheList.concat(data);
  }

  async fetchPoolByMints(
    props: {
      mint1: string | PublicKey;
      mint2?: string | PublicKey;
    } & Omit<FetchPoolParams, "pageSize">,
  ): Promise<ApiPaginatedPools> {
    const {
      mint1: propMint1,
      mint2: propMint2,
      type = PoolFetchType.All,
      sort = "default",
      order = "desc",
      page = 1,
    } = props;

    const [mint1, mint2] = [
      propMint1 ? solToWSol(propMint1).toBase58() : propMint1,
      propMint2 && propMint2 !== "undefined" ? solToWSol(propMint2).toBase58() : "",
    ];
    const [baseMint, quoteMint] = mint2 && mint1 > mint2 ? [mint2, mint1] : [mint1, mint2];

    const res = await this.api.get(
      (this.urlConfigs.POOL_SEARCH_MINT || API_URLS.POOL_SEARCH_MINT) +
        `?mint1=${baseMint}&mint2=${quoteMint}&poolType=${type}&poolSortField=${sort}&sortType=${order}&pageSize=100&page=${page}`,
    );
    return res.data;
  }
}
