import { Connection, Keypair, PublicKey, EpochInfo, Commitment } from "@solana/web3.js";
import { merge } from "lodash";

import { Api, API_URL_CONFIG, ApiV3Token } from "../api";
import { EMPTY_CONNECTION, EMPTY_OWNER } from "../common/error";
import { createLogger, Logger } from "../common/logger";
import { Owner } from "../common/owner";
import { Cluster } from "../solana";

import Account, { TokenAccountDataProp } from "./account/account";
import Cpmm from "./cpmm/cpmm";

import TokenModule from "./token/token";
import { SignAllTransactions } from "./type";

export interface ClientLoadParams extends TokenAccountDataProp, Omit<ClientApiBatchRequestParams, "api"> {
  /* ================= solana ================= */
  // solana web3 connection
  connection: Connection;
  // solana cluster/network/env
  cluster?: Cluster;
  // user public key
  owner?: PublicKey | Keypair;
  /* ================= api ================= */
  // api request interval in ms, -1 means never request again, 0 means always use fresh data, default is 5 mins (5 * 60 * 1000)
  apiRequestInterval?: number;
  // api request timeout in ms, default is 10 secs (10 * 1000)
  apiRequestTimeout?: number;
  apiCacheTime?: number;
  signAllTransactions?: SignAllTransactions;
  urlConfigs?: API_URL_CONFIG;
  logRequests?: boolean;
  logCount?: number;
  disableFeatureCheck?: boolean;
  disableLoadToken?: boolean;
  blockhashCommitment?: Commitment;
}

export interface ClientApiBatchRequestParams {
  api: Api;
  defaultChainTimeOffset?: number;
  defaultChainTime?: number;
}

export type ClientConstructorParams = Required<ClientLoadParams> & ClientApiBatchRequestParams;

interface DataBase<T> {
  fetched: number;
  data: T;
  extInfo?: Record<string, any>;
}
interface ApiData {
  jupTokenList?: DataBase<ApiV3Token[]>;
}

export class GfxCpmmClient {
  public cluster: Cluster;
  public account: Account;
  public cpmm: Cpmm;
  public token: TokenModule;
  public rawBalances: Map<string, string> = new Map();
  public apiData: ApiData;
  public blockhashCommitment: Commitment;

  private _connection: Connection;
  private _owner: Owner | undefined;
  public api: Api;
  private _apiCacheTime: number;
  private _signAllTransactions?: SignAllTransactions;
  private logger: Logger;
  private _chainTime?: {
    fetched: number;
    value: {
      chainTime: number;
      offset: number;
    };
  };
  private _epochInfo?: {
    fetched: number;
    value: EpochInfo;
  };

  constructor(config: ClientConstructorParams) {
    const {
      connection,
      cluster,
      owner,
      api,
      defaultChainTime,
      defaultChainTimeOffset,
      apiCacheTime,
      blockhashCommitment = "confirmed",
    } = config;

    this._connection = connection;
    this.cluster = cluster || "mainnet";
    this._owner = owner ? new Owner(owner) : undefined;
    this._signAllTransactions = config.signAllTransactions;
    this.blockhashCommitment = blockhashCommitment;

    this.api = api;
    this._apiCacheTime = apiCacheTime || 5 * 60 * 1000;
    this.logger = createLogger("Gfx");
    this.account = new Account({
      scope: this,
      moduleName: "Gfx_Account",
      tokenAccounts: config.tokenAccounts,
      tokenAccountRawInfos: config.tokenAccountRawInfos,
    });
    this.token = new TokenModule({ scope: this, moduleName: "Gfx_tokenV2" });
    this.cpmm = new Cpmm({ scope: this, moduleName: "Gfx_cpmm" });

    const now = new Date().getTime();
    this.apiData = {};

    if (defaultChainTimeOffset)
      this._chainTime = {
        fetched: now,
        value: {
          chainTime: defaultChainTime || Date.now() - defaultChainTimeOffset,
          offset: defaultChainTimeOffset,
        },
      };
  }

  static async load(config: ClientLoadParams): Promise<GfxCpmmClient> {
    const custom: Required<ClientLoadParams> = merge(
      // default
      {
        cluster: "mainnet",
        owner: null,
        apiRequestInterval: 5 * 60 * 1000,
        apiRequestTimeout: 10 * 1000,
      },
      config,
    );
    const { cluster, apiRequestTimeout, logCount, logRequests, urlConfigs } = custom;

    const api = new Api({ cluster, timeout: apiRequestTimeout, urlConfigs, logCount, logRequests });
    const client = new GfxCpmmClient({
      ...custom,
      api,
    });

    if (!config.disableLoadToken)
      await client.token.load({});

    return client;
  }

  get owner(): Owner | undefined {
    return this._owner;
  }
  get ownerPubKey(): PublicKey {
    if (!this._owner) throw new Error(EMPTY_OWNER);
    return this._owner.publicKey;
  }
  public setOwner(owner?: PublicKey | Keypair): GfxCpmmClient {
    this._owner = owner ? new Owner(owner) : undefined;
    this.account.resetTokenAccounts();
    return this;
  }
  get connection(): Connection {
    if (!this._connection) throw new Error(EMPTY_CONNECTION);
    return this._connection;
  }
  public setConnection(connection: Connection): GfxCpmmClient {
    this._connection = connection;
    return this;
  }
  get signAllTransactions(): SignAllTransactions | undefined {
    return this._signAllTransactions;
  }
  public setSignAllTransactions(signAllTransactions?: SignAllTransactions): GfxCpmmClient {
    this._signAllTransactions = signAllTransactions;
    return this;
  }

  public checkOwner(): void {
    if (!this.owner) {
      this.logger.error(EMPTY_OWNER);
      throw new Error(EMPTY_OWNER);
    }
  }

  private isCacheInvalidate(time: number): boolean {
    return new Date().getTime() - time > this._apiCacheTime;
  }

  public async fetchJupTokenList(forceUpdate?: boolean): Promise<ApiV3Token[]> {
    const prevFetched = this.apiData.jupTokenList;
    if (prevFetched && !this.isCacheInvalidate(prevFetched.fetched) && !forceUpdate) return prevFetched.data;
    try {
      const jupList = await this.api.getJupTokenList();
      this.apiData.jupTokenList = {
        fetched: Date.now(),
        data: jupList,
      };

      return this.apiData.jupTokenList.data;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  get chainTimeData(): { offset: number; chainTime: number } | undefined {
    return this._chainTime?.value;
  }

  public async fetchEpochInfo(): Promise<EpochInfo> {
    if (this._epochInfo && Date.now() - this._epochInfo.fetched <= 1000 * 30) return this._epochInfo.value;
    this._epochInfo = {
      fetched: Date.now(),
      value: await this.connection.getEpochInfo(),
    };
    return this._epochInfo.value;
  }
}
