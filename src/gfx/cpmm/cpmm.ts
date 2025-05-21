import { PublicKey, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, createSyncNativeInstruction } from "@solana/spl-token";
import { PoolInfo, PoolKeys, PoolStats } from "@/api/type";
import { Percent } from "@/module";
import { BN_ZERO } from "@/common/number";
import { WSOLMint } from "@/common/pubKey";
import { InstructionType, TxVersion } from "@/common/txTool/txType";
import { MakeTxData } from "@/common/txTool/txTool";
import { CurveCalculator, RoundDirection } from "./curve/calculator";

import ModuleBase, { ModuleBaseProps } from "../moduleBase";
import {
  CreateCpmmPoolParam,
  CreateCpmmPoolAddress,
  AddCpmmLiquidityParams,
  WithdrawCpmmLiquidityParams,
  CpmmSwapParams,
  ComputePairAmountParams,
  CpmmRpcData,
  CpmmComputeData,
  UserLiquidityAccount,
  CpmmObservationState,
  CpmmPool,
  CpmmPoolPartners,
  CpmmConfig,
} from "./type";
import { getCreatePoolKeys, getPdaObservationId, getPdaPoolPartners, getPdaUserLiquidity } from "./pda";
import {
  makeCreateCpmmPoolInInstruction,
  makeDepositCpmmInInstruction,
  makeInitUserPoolLiquidityInstruction,
  makeWithdrawCpmmInInstruction,
  makeSwapCpmmBaseInInstruction,
  makeSwapCpmmBaseOutInstruction,
  makeSwapCpmmOracleBaseInInstruction,
  makeInitializePartnerInstruction,
  makeAddPartnerInstruction,
} from "./instruction";
import BN from "bn.js";
import Decimal from "decimal.js";
import { fetchMultipleMintInfos, getTransferAmountFeeV2 } from "@/common";
import { ComputeBudgetConfig, GetTransferAmountFee, ReturnTypeFetchMultipleMintInfos } from "@/gfx/type";
import { toGammaApiToken, toFeeConfig, SOL_INFO } from "../token";
import { getPdaPoolAuthority } from "./pda";
import { ConstantProductCurve } from "./curve/constantProduct";
import { Program } from "@coral-xyz/anchor";
import { Gamma } from "../idl/gamma.type";
import { getReserveAccountsForWithdraw, getReservesForMarket, KaminoReserve } from "./kamino";

export default class CpmmModule extends ModuleBase {
  private program: Program<Gamma>;
  private kamino?: {
    market?: PublicKey;
    programId?: PublicKey;
  };
  /** map of liquidity mint to kamino reserve */
  private reserves: Map<string, KaminoReserve>;

  constructor(params: ModuleBaseProps) {
    super(params);
    this.program = params.scope.program;
    this.kamino = params.scope.kamino;
    this.reserves = new Map();
  }

  public async load(): Promise<void> {
    this.checkDisabled();
  }

  public async getCpmmPoolKeys(poolId: string): Promise<PoolKeys> {
    return ((await this.scope.api.fetchPoolKeysById({ idList: [poolId] })) as PoolKeys[])[0];
  }

  public async getRpcPoolInfo(poolId: string, fetchConfigInfo?: boolean): Promise<CpmmRpcData> {
    return (await this.getRpcPoolInfos([poolId], fetchConfigInfo))[poolId];
  }

  public async getTotalDepositsByPartner(
    poolIds: string[],
    partner: PublicKey,
  ): Promise<{
    [poolId: string]: {
      totalInvestedThoughPartnerToken0: BN;
      totalInvestedThoughPartnerToken1: BN;
      totalLpTokensLinked: BN;
    };
  }> {
    const partnerIds = poolIds.map((id) => getPdaPoolPartners(this.program.programId, new PublicKey(id)).publicKey);
    const poolInfos = await this.program.account.poolState.fetchMultiple(poolIds);
    const partnerInfos = await this.program.account.poolPartnerInfos.fetchMultiple(partnerIds);

    const returnData: {
      [poolId: string]: {
        totalInvestedThoughPartnerToken0: BN;
        totalInvestedThoughPartnerToken1: BN;
        totalLpTokensLinked: BN;
      };
    } = {};

    for (let i = 0; i < poolIds.length; i++) {
      const pool = poolInfos[i];
      const partners = partnerInfos[i];
      if (pool === null) throw Error("fetch pool info error: " + poolIds[i]);
      if (partners === null) throw Error("fetch poolPartners info error: " + partnerIds[i]);
      const { token0, token1, lp } = await this.getTokenInvestedByPartner(pool, partners, partner);

      returnData[poolIds[i]] = {
        totalInvestedThoughPartnerToken0: token0,
        totalInvestedThoughPartnerToken1: token1,
        totalLpTokensLinked: lp,
      };
    }

    return returnData;
  }

  public async getTokenInvestedByPartner(
    poolInfo: CpmmPool,
    partnerInfo: CpmmPoolPartners,
    partner: PublicKey,
  ): Promise<{ token0: BN; token1: BN; lp: BN }> {
    const lpTokensLinked =
      partnerInfo.infos.find((info) => info.partner.toBase58() === partner.toBase58())?.lpTokenLinkedWithPartner ??
      new BN(0);
    if (lpTokensLinked.eqn(0)) {
      return { token0: new BN(0), token1: new BN(0), lp: new BN(0) };
    }
    const lpToTradingToken = ConstantProductCurve.lpTokensToTradingTokens(
      lpTokensLinked,
      poolInfo.lpSupply,
      poolInfo.token0VaultAmount,
      poolInfo.token1VaultAmount,
      RoundDirection.Floor,
    );
    return {
      token0: lpToTradingToken.tokenAmount0,
      token1: lpToTradingToken.tokenAmount1,
      lp: lpTokensLinked,
    };
  }

  public async getRpcPoolInfos(
    poolIds: string[],
    fetchConfigInfo?: boolean,
  ): Promise<{
    [poolId: string]: CpmmRpcData;
  }> {
    const partnerIds = poolIds.map((id) => getPdaPoolPartners(this.program.programId, new PublicKey(id)).publicKey);
    const observationIds = poolIds.map(
      (id) => getPdaObservationId(this.program.programId, new PublicKey(id)).publicKey,
    );

    const [accounts, partnerInfos, observations] = await Promise.all([
      this.program.account.poolState.fetchMultiple(poolIds),
      this.program.account.poolPartnerInfos.fetchMultiple(partnerIds),
      this.program.account.observationState.fetchMultiple(observationIds),
    ]);

    const poolInfos: {
      [poolId: string]: CpmmPool & {
        observationAccount: CpmmObservationState;
        partnerInfo: CpmmPoolPartners;
        programId: PublicKey;
      };
    } = {};

    const needFetchConfigId = new Set<string>();

    for (let i = 0; i < poolIds.length; i++) {
      const rpc = accounts[i];
      const partnerInfo = partnerInfos[i];
      const observationAccount = observations[i];
      if (rpc === null) throw Error("fetch pool info error: " + String(poolIds[i]));
      if (partnerInfo === null) throw Error("failed to fetch poolPartners for pool: " + poolIds[i]);
      if (observationAccount === null) throw Error("failed to fetch observation for pool: " + poolIds[i]);

      poolInfos[String(poolIds[i])] = {
        ...rpc,
        partnerInfo,
        observationAccount,
        programId: this.program.programId,
      };
      needFetchConfigId.add(String(rpc.ammConfig));
    }

    const configInfo: { [configId: string]: CpmmConfig } = {};

    if (fetchConfigInfo) {
      const configIds = [...needFetchConfigId];
      const configs = await this.program.account.ammConfig.fetchMultiple(configIds);

      for (let i = 0; i < configIds.length; i++) {
        const configItemInfo = configs[i];
        if (configItemInfo === null) throw Error("fetch pool config error: " + configIds[i]);
        configInfo[configIds[i]] = configItemInfo;
      }
    }

    const returnData: { [poolId: string]: CpmmRpcData } = {};

    for (const [id, info] of Object.entries(poolInfos)) {
      const baseReserve = info.token0VaultAmount;
      const quoteReserve = info.token1VaultAmount;
      returnData[id] = {
        ...info,
        baseReserve: info.token0VaultAmount,
        quoteReserve: info.token1VaultAmount,
        vaultAAmount: info.token0VaultAmount
          .add(info.protocolFeesToken0)
          .add(info.fundFeesToken0)
          .add(info.partnerProtocolFeesToken0),
        vaultBAmount: info.token1VaultAmount
          .add(info.protocolFeesToken1)
          .add(info.fundFeesToken1)
          .add(info.partnerProtocolFeesToken1),
        configInfo: configInfo[info.ammConfig.toString()],
        poolPrice: new Decimal(quoteReserve.toString())
          .div(new Decimal(10).pow(info.mint1Decimals))
          .div(new Decimal(baseReserve.toString()).div(new Decimal(10).pow(info.mint0Decimals))),
      };
    }

    return returnData;
  }

  public toComputePoolInfos({
    pools,
    mintInfos,
  }: {
    pools: Record<string, CpmmRpcData>;
    mintInfos: ReturnTypeFetchMultipleMintInfos;
  }): Record<string, CpmmComputeData> {
    return Object.keys(pools).reduce((acc, cur) => {
      const pool = pools[cur];
      const [mintA, mintB] = [pool.token0Mint.toBase58(), pool.token1Mint.toBase58()];

      return {
        ...acc,
        [cur]: {
          ...pool,
          id: new PublicKey(cur),
          configInfo: pool.configInfo!,
          version: 7 as const,
          authority: getPdaPoolAuthority(pool.programId).publicKey,
          mintA: toGammaApiToken({
            address: mintA,
            decimals: pool.mint0Decimals,
            programId: pool.token0Program.toBase58(),
            extensions: {
              feeConfig: mintInfos[mintA]?.feeConfig ? toFeeConfig(mintInfos[mintA]?.feeConfig) : undefined,
            },
          }),
          mintB: toGammaApiToken({
            address: mintB,
            decimals: pool.mint1Decimals,
            programId: pool.token1Program.toBase58(),
            extensions: {
              feeConfig: mintInfos[mintB]?.feeConfig ? toFeeConfig(mintInfos[mintB]?.feeConfig) : undefined,
            },
          }),
        },
      };
    }, {} as Record<string, CpmmComputeData>);
  }

  public async getPoolInfoFromRpc(poolId: string): Promise<{
    poolInfo: PoolInfo;
    poolKeys: PoolKeys;
    rpcData: CpmmRpcData;
  }> {
    const rpcData = await this.getRpcPoolInfo(poolId, true);
    const partnerKeys = rpcData
      .partnerInfo!.infos.map((i) => i.partner.toBase58())
      .filter((i) => i !== PublicKey.default.toBase58());
    const partners =
      partnerKeys.length > 0
        ? await this.program.account.partner.fetchMultiple(partnerKeys).then((res) =>
            res
              .filter((r) => r !== null)
              .map((r, index) => {
                return {
                  acc: r,
                  address: partnerKeys[index],
                };
              }),
          )
        : [];

    const mintInfos = await fetchMultipleMintInfos({
      connection: this.scope.connection,
      mints: [rpcData.token0Mint, rpcData.token1Mint],
    });

    const mintA = toGammaApiToken({
      address: rpcData.token0Mint.toBase58(),
      decimals: rpcData.mint0Decimals,
      programId: rpcData.token0Program.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.token0Mint.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.token0Mint.toBase58()].feeConfig)
          : undefined,
      },
    });
    const mintB = toGammaApiToken({
      address: rpcData.token1Mint.toBase58(),
      decimals: rpcData.mint1Decimals,
      programId: rpcData.token1Program.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.token1Mint.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.token1Mint.toBase58()].feeConfig)
          : undefined,
      },
    });

    const configInfo = {
      id: rpcData.ammConfig.toBase58(),
      index: rpcData.configInfo!.index,
      protocolFeeRate: rpcData.configInfo!.protocolFeeRate.toNumber(),
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
      fundFeeRate: rpcData.configInfo!.fundFeeRate.toNumber(),
      createPoolFee: rpcData.configInfo!.createPoolFee.toString(),
      protocolOwner: rpcData.configInfo!.protocolOwner.toString(),
      fundOwner: rpcData.configInfo!.fundOwner.toString(),
    };

    const mockPoolStats: PoolStats = {
      range: "24H",
      feesUsd: 0,
      volumeTokenAUsd: 0,
      volumeTokenBUsd: 0,
      feesAprUsd: 0,
      volumeAprUsd: 0,
      withdrawnKaminoProfitTokenAUsd: 0,
      withdrawnKaminoProfitTokenBUsd: 0,
      withdrawnKaminoProfitTokenAAprUsd: 0,
      withdrawnKaminoProfitTokenBAprUsd: 0,
    };

    return {
      poolInfo: {
        programId: rpcData.programId.toBase58(),
        id: poolId,
        config: configInfo,
        mintA,
        mintB,
        price: rpcData.poolPrice.toString(),
        liquidityTokenA: new Decimal(rpcData.vaultAAmount.toString()).div(10 ** mintA.decimals).toString(),
        liquidityTokenB: new Decimal(rpcData.vaultBAmount.toString()).div(10 ** mintB.decimals).toString(),
        lpSupply: rpcData.lpSupply.toString(),
        poolCreator: rpcData.poolCreator.toBase58(),
        poolType: "hyper",
        mintAVault: rpcData.token0Vault.toBase58(),
        mintBVault: rpcData.token1Vault.toBase58(),
        authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
        openTime: rpcData.openTime.toString(),
        tvl: "0",
        stats: {
          daily: mockPoolStats,
          weekly: mockPoolStats,
          monthly: mockPoolStats,
        },
        partners: partners.map((p) => {
          return {
            address: p.address,
            name: p.acc.name,
            authority: p.acc.authority.toBase58(),
            token0TokenAccount: p.acc.token0TokenAccount.toBase58(),
            token1TokenAccount: p.acc.token1TokenAccount.toBase58(),
          };
        }),
      },
      poolKeys: {
        programId: rpcData.programId.toBase58(),
        id: poolId,
        mintA: mintA.address,
        mintB: mintB.address,
        openTime: rpcData.openTime.toString(),
        mintAVault: rpcData.token0Vault.toBase58(),
        mintBVault: rpcData.token1Vault.toBase58(),
        authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
        config: configInfo,
        mintAProgram: rpcData.token0Program.toBase58(),
        mintBProgram: rpcData.token1Program.toBase58(),
        poolType: "hyper",
      },
      rpcData,
    };
  }

  public async createPool<T extends TxVersion>({
    programId,
    poolFeeAccount,
    startTime,
    maxTradeFeeRate,
    volatilityFactor,
    ownerInfo,
    associatedOnly = false,
    checkCreateATAOwner = false,
    txVersion,
    feeConfig,
    computeBudgetConfig,
    ...params
  }: CreateCpmmPoolParam<T>): Promise<MakeTxData<T, { address: CreateCpmmPoolAddress }>> {
    const payer = ownerInfo.feePayer || this.scope.owner?.publicKey;
    const isFront = new BN(new PublicKey(params.mintA.address).toBuffer()).lte(
      new BN(new PublicKey(params.mintB.address).toBuffer()),
    );

    const [mintA, mintB] = isFront ? [params.mintA, params.mintB] : [params.mintB, params.mintA];
    const [mintAAmount, mintBAmount] = isFront
      ? [params.mintAAmount, params.mintBAmount]
      : [params.mintBAmount, params.mintAAmount];

    const mintAUseSOLBalance = ownerInfo.useSOLBalance && mintA.address === NATIVE_MINT.toBase58();
    const mintBUseSOLBalance = ownerInfo.useSOLBalance && mintB.address === NATIVE_MINT.toBase58();
    const [mintAPubkey, mintBPubkey] = [new PublicKey(mintA.address), new PublicKey(mintB.address)];
    const txBuilder = this.createTxBuilder();

    const { account: userVaultA, instructionParams: userVaultAInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintAPubkey,
        tokenProgram: mintA.programId,
        owner: this.scope.ownerPubKey,
        createInfo: mintAUseSOLBalance
          ? {
              payer: payer!,
              amount: mintAAmount,
            }
          : undefined,
        notUseTokenAccount: mintAUseSOLBalance,
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    txBuilder.addInstruction(userVaultAInstruction || {});
    const { account: userVaultB, instructionParams: userVaultBInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: new PublicKey(mintB.address),
        tokenProgram: mintB.programId,
        owner: this.scope.ownerPubKey,
        createInfo: mintBUseSOLBalance
          ? {
              payer: payer!,
              amount: mintBAmount,
            }
          : undefined,

        notUseTokenAccount: mintBUseSOLBalance,
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    txBuilder.addInstruction(userVaultBInstruction || {});

    if (userVaultA === undefined || userVaultB === undefined)
      throw Error("One or both of user's token account does not exist");

    const poolKeys = getCreatePoolKeys({
      programId,
      configId: new PublicKey(feeConfig.id),
      mintA: mintAPubkey,
      mintB: mintBPubkey,
    });

    txBuilder.addInstruction({
      instructions: [
        await makeCreateCpmmPoolInInstruction(
          this.program,
          this.scope.ownerPubKey,
          new PublicKey(feeConfig.id),
          mintAPubkey,
          mintBPubkey,
          userVaultA,
          userVaultB,
          new PublicKey(mintA.programId ?? TOKEN_PROGRAM_ID),
          new PublicKey(mintB.programId ?? TOKEN_PROGRAM_ID),
          mintAAmount,
          mintBAmount,
          startTime,
          maxTradeFeeRate,
          volatilityFactor,
        ),
      ],
      instructionTypes: [InstructionType.CpmmCreatePool],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({
      txVersion,
      extInfo: {
        address: { ...poolKeys, mintA, mintB, programId, poolFeeAccount, feeConfig },
      },
    }) as Promise<MakeTxData<T, { address: CreateCpmmPoolAddress }>>;
  }

  public async addLiquidity<T extends TxVersion>(params: AddCpmmLiquidityParams<T>): Promise<MakeTxData<T>> {
    const {
      poolInfo,
      poolKeys: propPoolKeys,
      inputAmount,
      baseSpecified,
      slippage,
      computeResult,
      computeBudgetConfig,
      config,
      txVersion,
      partner,
    } = params;

    // if (this.scope.availability.addStandardPosition === false)
    //   this.logAndCreateError("add liquidity feature disabled in your region");

    if (inputAmount.isZero())
      this.logAndCreateError("amounts must greater than zero", "amountInA", {
        amountInA: inputAmount.toString(),
      });
    const { account } = this.scope;
    const { bypassAssociatedCheck, checkCreateATAOwner } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false },
      // custom
      ...config,
    };
    const rpcPoolData = computeResult ? undefined : await this.getRpcPoolInfo(poolInfo.id);

    const {
      liquidity,
      inputAmountFee,
      anotherAmount: _anotherAmount,
    } = computeResult ||
    this.computePairAmount({
      poolInfo: {
        ...poolInfo,
      },
      baseReserve: rpcPoolData!.baseReserve,
      quoteReserve: rpcPoolData!.quoteReserve,
      slippage: new Percent(0),
      baseSpecified,
      epochInfo: await this.scope.fetchEpochInfo(),
      amount: new Decimal(inputAmount.toString()).div(
        10 ** (baseSpecified? poolInfo.mintA.decimals : poolInfo.mintB.decimals),
      ),
    });

    const anotherAmount = _anotherAmount.amount;
    const mintAUseSOLBalance = poolInfo.mintA.address === NATIVE_MINT.toString();
    const mintBUseSOLBalance = poolInfo.mintB.address === NATIVE_MINT.toString();

    const txBuilder = this.createTxBuilder();
    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));
    const { account: tokenAccountA, instructionParams: _tokenAccountAInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolKeys.mintAProgram,
        mint: new PublicKey(poolInfo.mintA.address),
        owner: this.scope.ownerPubKey,

        createInfo:
          mintAUseSOLBalance || (baseSpecified ? inputAmount : anotherAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseSpecified ? inputAmount : anotherAmount,
              }
            : undefined,
        skipCloseAccount: !mintAUseSOLBalance,
        notUseTokenAccount: mintAUseSOLBalance,
        associatedOnly: false,
        checkCreateATAOwner,
      });

    txBuilder.addInstruction(_tokenAccountAInstruction || {});

    const { account: tokenAccountB, instructionParams: _tokenAccountBInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolKeys.mintBProgram,
        mint: new PublicKey(poolInfo.mintB.address),
        owner: this.scope.ownerPubKey,

        createInfo:
          mintBUseSOLBalance || (baseSpecified ? anotherAmount : inputAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseSpecified ? anotherAmount : inputAmount,
              }
            : undefined,
        skipCloseAccount: !mintBUseSOLBalance,
        notUseTokenAccount: mintBUseSOLBalance,
        associatedOnly: false,
        checkCreateATAOwner,
      });

    txBuilder.addInstruction(_tokenAccountBInstruction || {});

    if (!tokenAccountA && !tokenAccountB)
      this.logAndCreateError("cannot found target token accounts", "tokenAccounts", account.tokenAccounts);
    const userLiquidityPda = getPdaUserLiquidity(
      new PublicKey(poolInfo.programId),
      new PublicKey(poolInfo.id),
      this.scope.ownerPubKey,
    );
    const userLiquidity = await this.getRpcUserLiquidityAccounts([userLiquidityPda.publicKey]).then((a) => a[0]);
    if (!userLiquidity) {
      txBuilder.addInstruction({
        instructions: [
          await makeInitUserPoolLiquidityInstruction(
            this.program,
            this.scope.ownerPubKey,
            new PublicKey(poolInfo.id),
            partner ? partner : null,
          ),
        ],
        instructionTypes: [InstructionType.CpmmInitUserLiquidity],
        lookupTableAddress: [],
      });
    }

    const _slippage = new Percent(new BN(1)).sub(slippage);

    txBuilder.addInstruction({
      instructions: [
        await makeDepositCpmmInInstruction(
          this.program,
          this.scope.ownerPubKey,
          new PublicKey(poolInfo.id),
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.mintAVault),
          new PublicKey(poolKeys.mintBVault),
          mintA,
          mintB,

          computeResult ? computeResult?.liquidity : _slippage.mul(liquidity).quotient,
          baseSpecified ? inputAmountFee.amount : anotherAmount,
          baseSpecified ? anotherAmount : inputAmountFee.amount,
        ),
      ],
      instructionTypes: [InstructionType.CpmmAddLiquidity],
      lookupTableAddress: [],
    });
    txBuilder.addCustomComputeBudget(computeBudgetConfig);
    const builder = txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async withdrawLiquidity<T extends TxVersion>(params: WithdrawCpmmLiquidityParams<T>): Promise<MakeTxData<T>> {
    const { poolInfo, poolKeys: propPoolKeys, lpAmount, slippage, computeBudgetConfig, txVersion } = params;
    let tokenAReserve: KaminoReserve | undefined = this.reserves.get(poolInfo.mintA.address);
    let tokenBReserve: KaminoReserve | undefined = this.reserves.get(poolInfo.mintB.address);
    if (!tokenAReserve || !tokenBReserve) {
      this.reserves = await getReservesForMarket(this.program.provider.connection);
      tokenAReserve = this.reserves.get(poolInfo.mintA.address);
      tokenBReserve = this.reserves.get(poolInfo.mintB.address);
    }

    // if (this.scope.availability.addStandardPosition === false)
    //   this.logAndCreateError("add liquidity feature disabled in your region");

    const rpcPoolData = await this.getRpcPoolInfo(poolInfo.id);
    const kaminoAccounts = getReserveAccountsForWithdraw(
      new PublicKey(poolInfo.id),
      tokenAReserve,
      tokenBReserve,
      rpcPoolData.maxSharedToken0,
      rpcPoolData.maxSharedToken1,
      this.program.programId,
      this.kamino?.programId,
    );

    const _slippage = new Percent(new BN(1)).sub(slippage);
    const [amountMintA, amountMintB] = [
      _slippage.mul(lpAmount.mul(rpcPoolData.baseReserve).div(rpcPoolData.lpSupply)).quotient,
      _slippage.mul(lpAmount.mul(rpcPoolData.quoteReserve).div(rpcPoolData.lpSupply)).quotient,
    ];

    const epochInfo = await this.scope.fetchEpochInfo();
    const [mintAAmountFee, mintBAmountFee] = [
      getTransferAmountFeeV2(amountMintA, poolInfo.mintA.extensions?.feeConfig, epochInfo, false),
      getTransferAmountFeeV2(amountMintB, poolInfo.mintB.extensions?.feeConfig, epochInfo, false),
    ];

    const { account } = this.scope;
    const txBuilder = this.createTxBuilder();
    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    const mintAUseSOLBalance = mintA.equals(WSOLMint);
    const mintBUseSOLBalance = mintB.equals(WSOLMint);

    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));

    let tokenAccountA: PublicKey | undefined = undefined;
    let tokenAccountB: PublicKey | undefined = undefined;
    const { account: _ownerTokenAccountA, instructionParams: accountAInstructions } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolKeys.mintAProgram,
        mint: new PublicKey(poolInfo.mintA.address),
        notUseTokenAccount: mintAUseSOLBalance,
        owner: this.scope.ownerPubKey,
        createInfo: {
          payer: this.scope.ownerPubKey,
          amount: 0,
        },
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : true,
        checkCreateATAOwner: false,
      });
    tokenAccountA = _ownerTokenAccountA;
    accountAInstructions && txBuilder.addInstruction(accountAInstructions);

    const { account: _ownerTokenAccountB, instructionParams: accountBInstructions } =
      await this.scope.account.getOrCreateTokenAccount({
        tokenProgram: poolKeys.mintBProgram,
        mint: new PublicKey(poolInfo.mintB.address),
        notUseTokenAccount: mintBUseSOLBalance,
        owner: this.scope.ownerPubKey,
        createInfo: {
          payer: this.scope.ownerPubKey,
          amount: 0,
        },
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : true,
        checkCreateATAOwner: false,
      });
    tokenAccountB = _ownerTokenAccountB;
    accountBInstructions && txBuilder.addInstruction(accountBInstructions);

    if (!tokenAccountA || !tokenAccountB)
      this.logAndCreateError("cannot found target token accounts", "tokenAccounts", account.tokenAccounts);

    const userLiquidityPda = getPdaUserLiquidity(
      new PublicKey(poolInfo.programId),
      new PublicKey(poolInfo.id),
      this.scope.ownerPubKey,
    );
    const userLiquidity = await this.getRpcUserLiquidityAccounts([userLiquidityPda.publicKey]).then((a) => a[0]);

    if (!userLiquidity) this.logAndCreateError("cannot found userLiquidityAccount");
    txBuilder.addInstruction({
      instructions: [
        await makeWithdrawCpmmInInstruction(
          this.program,
          this.scope.ownerPubKey,
          new PublicKey(poolInfo.id),
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.mintAVault),
          new PublicKey(poolKeys.mintBVault),
          mintA,
          mintB,

          lpAmount,
          amountMintA.sub(mintAAmountFee.fee ?? new BN(0)),
          amountMintB.sub(mintBAmountFee.fee ?? new BN(0)),
          kaminoAccounts,
        ),
      ],
      instructionTypes: [InstructionType.CpmmWithdrawLiquidity],
      lookupTableAddress: [],
    });
    txBuilder.addCustomComputeBudget(computeBudgetConfig);
    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async swap<T extends TxVersion>(params: CpmmSwapParams<T>): Promise<MakeTxData<T>> {
    const {
      poolInfo,
      poolKeys: propPoolKeys,
      zeroForOne,
      baseIn,
      swapResult,
      slippage = 0,
      config,
      computeBudgetConfig,
      txVersion,
      wrapSol,
    } = params;

    const { bypassAssociatedCheck, checkCreateATAOwner, associatedOnly } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false, associatedOnly: true },
      // custom
      ...config,
    };

    const txBuilder = this.createTxBuilder();

    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    if (baseIn) {
      swapResult.destinationAmountSwapped = swapResult.destinationAmountSwapped
        .mul(new BN((1 - slippage) * 10000))
        .div(new BN(10000));
    } else {
      swapResult.sourceAmountSwapped = swapResult.sourceAmountSwapped
        .mul(new BN((1 + slippage) * 10000))
        .div(new BN(10000));
    }

    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));

    const mintAUseSOLBalance = poolInfo.mintA.address === WSOLMint.toBase58();
    const mintBUseSOLBalance = poolInfo.mintB.address === WSOLMint.toBase58();
    const { account: mintATokenAcc, instructionParams: mintATokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintA,
        tokenProgram: new PublicKey(poolKeys.mintAProgram),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintAUseSOLBalance || !zeroForOne
            ? {
                payer: this.scope.ownerPubKey,
                amount: zeroForOne ? swapResult.sourceAmountSwapped : 0,
              }
            : undefined,
        notUseTokenAccount: mintAUseSOLBalance,
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintATokenAccInstruction && txBuilder.addInstruction(mintATokenAccInstruction);

    const { account: mintBTokenAcc, instructionParams: mintBTokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintB,
        tokenProgram: new PublicKey(poolKeys.mintBProgram),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintBUseSOLBalance || zeroForOne
            ? {
                payer: this.scope.ownerPubKey,
                amount: zeroForOne ? 0 : swapResult.sourceAmountSwapped,
              }
            : undefined,
        notUseTokenAccount: mintBUseSOLBalance,
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintBTokenAccInstruction && txBuilder.addInstruction(mintBTokenAccInstruction);

    if (!mintATokenAcc || !mintBTokenAcc)
      this.logAndCreateError("user do not have token account", {
        mintA: poolInfo.mintA.symbol || poolInfo.mintA.address,
        mintB: poolInfo.mintB.symbol || poolInfo.mintB.address,
        mintATokenAcc,
        mintBTokenAcc,
        mintAUseSOLBalance,
        mintBUseSOLBalance,
        associatedOnly,
      });

    const inputMint = zeroForOne ? poolInfo.mintA.address : poolInfo.mintB.address;
    if (wrapSol && inputMint === SOL_INFO.address) {
      txBuilder.addInstruction({
        instructions: [
          SystemProgram.transfer({
            fromPubkey: this.scope.ownerPubKey,
            toPubkey: zeroForOne ? mintATokenAcc! : mintBTokenAcc!,
            lamports: BigInt(swapResult.sourceAmountSwapped.toString()),
          }),
          createSyncNativeInstruction(new PublicKey(zeroForOne ? mintATokenAcc! : mintBTokenAcc!)),
        ],
      });
    }

    txBuilder.addInstruction({
      instructions: [
        baseIn
          ? await makeSwapCpmmBaseInInstruction(
              this.program,
              this.scope.ownerPubKey,
              new PublicKey(poolKeys.config.id),
              new PublicKey(poolInfo.id),
              zeroForOne ? mintATokenAcc! : mintBTokenAcc!,
              zeroForOne ? mintBTokenAcc! : mintATokenAcc!,
              new PublicKey(zeroForOne ? poolKeys.mintAVault : poolKeys.mintBVault),
              new PublicKey(zeroForOne ? poolKeys.mintBVault : poolKeys.mintAVault),
              new PublicKey(zeroForOne ? poolKeys.mintAProgram : poolKeys.mintBProgram),
              new PublicKey(zeroForOne ? poolKeys.mintBProgram : poolKeys.mintAProgram),
              zeroForOne ? mintA : mintB,
              zeroForOne ? mintB : mintA,
              getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

              swapResult.sourceAmountSwapped,
              swapResult.destinationAmountSwapped,
              params.dflowSegmenterOptions,
              params.referralAccounts,
            )
          : await makeSwapCpmmBaseOutInstruction(
              this.program,
              this.scope.ownerPubKey,
              new PublicKey(poolKeys.config.id),
              new PublicKey(poolInfo.id),

              zeroForOne ? mintATokenAcc! : mintBTokenAcc!,
              zeroForOne ? mintBTokenAcc! : mintATokenAcc!,

              new PublicKey(zeroForOne ? poolKeys.mintAVault : poolKeys.mintBVault),
              new PublicKey(zeroForOne ? poolKeys.mintBVault : poolKeys.mintAVault),
              new PublicKey(zeroForOne ? poolKeys.mintAProgram : poolKeys.mintBProgram),
              new PublicKey(zeroForOne ? poolKeys.mintBProgram : poolKeys.mintAProgram),
              zeroForOne ? mintA : mintB,
              zeroForOne ? mintB : mintA,

              getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

              swapResult.sourceAmountSwapped,
              swapResult.destinationAmountSwapped,
              params.dflowSegmenterOptions,
              params.referralAccounts,
            ),
      ],
      instructionTypes: [baseIn ? InstructionType.CpmmSwapBaseIn : InstructionType.CpmmSwapBaseOut],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async swapWithOracle<T extends TxVersion>(params: CpmmSwapParams<T>): Promise<MakeTxData<T>> {
    const {
      poolInfo,
      poolKeys: propPoolKeys,
      zeroForOne,
      swapResult,
      slippage = 0,
      config,
      computeBudgetConfig,
      txVersion,
      wrapSol,
    } = params;

    const { bypassAssociatedCheck, checkCreateATAOwner, associatedOnly } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false, associatedOnly: true },
      // custom
      ...config,
    };

    const txBuilder = this.createTxBuilder();

    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    swapResult.destinationAmountSwapped = swapResult.destinationAmountSwapped
      .mul(new BN((1 - slippage) * 10000))
      .div(new BN(10000));

    const poolKeys = propPoolKeys ?? (await this.getCpmmPoolKeys(poolInfo.id));

    const mintAUseSOLBalance = poolInfo.mintA.address === WSOLMint.toBase58();
    const mintBUseSOLBalance = poolInfo.mintB.address === WSOLMint.toBase58();
    const { account: mintATokenAcc, instructionParams: mintATokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintA,
        tokenProgram: new PublicKey(poolKeys.mintAProgram),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintAUseSOLBalance || !zeroForOne
            ? {
                payer: this.scope.ownerPubKey,
                amount: zeroForOne ? swapResult.sourceAmountSwapped : 0,
              }
            : undefined,
        notUseTokenAccount: mintAUseSOLBalance,
        skipCloseAccount: !mintAUseSOLBalance,
        associatedOnly: mintAUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintATokenAccInstruction && txBuilder.addInstruction(mintATokenAccInstruction);

    const { account: mintBTokenAcc, instructionParams: mintBTokenAccInstruction } =
      await this.scope.account.getOrCreateTokenAccount({
        mint: mintB,
        tokenProgram: new PublicKey(poolKeys.mintBProgram),
        owner: this.scope.ownerPubKey,
        createInfo:
          mintBUseSOLBalance || zeroForOne
            ? {
                payer: this.scope.ownerPubKey,
                amount: zeroForOne ? 0 : swapResult.sourceAmountSwapped,
              }
            : undefined,
        notUseTokenAccount: mintBUseSOLBalance,
        skipCloseAccount: !mintBUseSOLBalance,
        associatedOnly: mintBUseSOLBalance ? false : associatedOnly,
        checkCreateATAOwner,
      });
    mintBTokenAccInstruction && txBuilder.addInstruction(mintBTokenAccInstruction);

    if (!mintATokenAcc || !mintBTokenAcc)
      this.logAndCreateError("user do not have token account", {
        mintA: poolInfo.mintA.symbol || poolInfo.mintA.address,
        mintB: poolInfo.mintB.symbol || poolInfo.mintB.address,
        mintATokenAcc,
        mintBTokenAcc,
        mintAUseSOLBalance,
        mintBUseSOLBalance,
        associatedOnly,
      });

    const inputMint = zeroForOne ? poolInfo.mintA.address : poolInfo.mintB.address;
    if (wrapSol && inputMint === SOL_INFO.address) {
      txBuilder.addInstruction({
        instructions: [
          SystemProgram.transfer({
            fromPubkey: this.scope.ownerPubKey,
            toPubkey: zeroForOne ? mintATokenAcc! : mintBTokenAcc!,
            lamports: BigInt(swapResult.sourceAmountSwapped.toString()),
          }),
          createSyncNativeInstruction(new PublicKey(zeroForOne ? mintATokenAcc! : mintBTokenAcc!)),
        ],
      });
    }

    txBuilder.addInstruction({
      instructions: [
        await makeSwapCpmmOracleBaseInInstruction(
          this.program,
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.config.id),
          new PublicKey(poolInfo.id),
          zeroForOne ? mintATokenAcc! : mintBTokenAcc!,
          zeroForOne ? mintBTokenAcc! : mintATokenAcc!,
          new PublicKey(zeroForOne ? poolKeys.mintAVault : poolKeys.mintBVault),
          new PublicKey(zeroForOne ? poolKeys.mintBVault : poolKeys.mintAVault),
          new PublicKey(zeroForOne ? poolKeys.mintAProgram : poolKeys.mintBProgram),
          new PublicKey(zeroForOne ? poolKeys.mintBProgram : poolKeys.mintAProgram),
          zeroForOne ? mintA : mintB,
          zeroForOne ? mintB : mintA,
          getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

          swapResult.sourceAmountSwapped,
          swapResult.destinationAmountSwapped,
          params.dflowSegmenterOptions,
          params.referralAccounts,
        ),
      ],
      instructionTypes: [InstructionType.CpmmSwapBaseIn],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public computeSwapAmount({
    pool,
    amount,
    baseIn,
    zeroForOne,
    slippage,
    observationState,
  }: {
    pool: CpmmComputeData;
    amount: BN;
    baseIn: boolean;
    zeroForOne: boolean;
    slippage: number;
    observationState: CpmmObservationState;
  }): {
    allTrade: boolean;
    amountIn: BN;
    amountOut: BN;
    minAmountOut: BN;
    maxAmountIn: BN;
    fee: BN;
    executionPrice: Decimal;
    priceImpact: Decimal;
  } {
    const [inputToken, outputToken, inputTokenReserves, outputTokenReserves] = zeroForOne
      ? [pool.mintA, pool.mintB, pool.baseReserve, pool.quoteReserve]
      : [pool.mintB, pool.mintA, pool.quoteReserve, pool.baseReserve];

    const inputDecimals = inputToken.decimals;
    const outputDecimals = outputToken.decimals;

    const swapResult = baseIn
      ? CurveCalculator.swapBaseIn(
          amount,
          new BN(inputTokenReserves),
          new BN(outputTokenReserves),
          new BN(pool.configInfo.tradeFeeRate),
          observationState,
          pool.volatilityFactor,
        )
      : CurveCalculator.swapBaseOut(
          amount,
          new BN(inputTokenReserves),
          new BN(outputTokenReserves),
          new BN(pool.configInfo.tradeFeeRate),
          observationState,
          pool.volatilityFactor,
        );

    const currentPrice = zeroForOne ? pool.poolPrice : new Decimal(1).div(pool.poolPrice);
    const numerator = new Decimal(swapResult.destinationAmountSwapped.toString()).div(
      new Decimal(10).pow(inputDecimals),
    );
    const denominator = new Decimal(swapResult.sourceAmountSwapped.toString()).div(new Decimal(10).pow(outputDecimals));
    const executionPrice = numerator.div(denominator);

    const otherAmountThreshold = baseIn
      ? swapResult.destinationAmountSwapped.mul(new BN((1 - slippage) * 10000)).div(new BN(10000))
      : swapResult.sourceAmountSwapped.mul(new BN((1 + slippage) * 10000)).div(new BN(10000));

    return {
      allTrade: baseIn ? swapResult.sourceAmountSwapped.eq(amount) : swapResult.destinationAmountSwapped.eq(amount),
      amountIn: swapResult.sourceAmountSwapped,
      amountOut: swapResult.destinationAmountSwapped,
      maxAmountIn: baseIn ? swapResult.sourceAmountSwapped : otherAmountThreshold,
      minAmountOut: baseIn ? otherAmountThreshold : swapResult.destinationAmountSwapped,
      executionPrice,
      fee: swapResult.tradeFee,
      priceImpact: currentPrice.sub(executionPrice).div(currentPrice),
    };
  }

  public computePairAmount({
    poolInfo,
    baseReserve,
    quoteReserve,
    amount,
    slippage,
    epochInfo,
    baseSpecified
  }: ComputePairAmountParams): {
    inputAmountFee: GetTransferAmountFee;
    anotherAmount: GetTransferAmountFee;
    maxAnotherAmount: GetTransferAmountFee;
    liquidity: BN;
  } {
    const coefficient = 1 - Number(slippage.toSignificant()) / 100;
    const inputAmount = new BN(
      new Decimal(amount)
        .mul(10 ** poolInfo[baseSpecified ? "mintA" : "mintB"].decimals)
        .mul(coefficient)
        .toFixed(0),
    );
    const inputAmountFee = getTransferAmountFeeV2(
      inputAmount,
      (baseSpecified ? poolInfo.mintA : poolInfo.mintB).extensions?.feeConfig,
      epochInfo,
      false,
    );
    const _inputAmountWithoutFee = inputAmount.sub(inputAmountFee.fee ?? new BN(0));

    const lpAmount = new BN(poolInfo.lpSupply ?? "0");
    this.logDebug("baseReserve:", baseReserve.toString(), "quoteReserve:", quoteReserve.toString());

    this.logDebug(
      "tokenIn:",
      baseSpecified ? poolInfo.mintA.symbol : poolInfo.mintB.symbol,
      "amountIn:",
      inputAmount.toString(),
      "amountInFee:",
      inputAmountFee.fee?.toString() ?? 0,
      "anotherToken:",
      baseSpecified ? poolInfo.mintB.symbol : poolInfo.mintA.symbol,
      "slippage:",
      `${slippage.toSignificant()}%`,
    );

    // input is fixed
    const input = baseSpecified ? "base" : "quote";
    this.logDebug("input side:", input);

    const liquidity = _inputAmountWithoutFee.mul(lpAmount).div(input === "base" ? baseReserve : quoteReserve);
    let anotherAmountFee: GetTransferAmountFee = {
      amount: BN_ZERO,
      fee: undefined,
      expirationTime: undefined,
    };
    if (!_inputAmountWithoutFee.isZero()) {
      const lpAmountData = lpToAmount(liquidity, baseReserve, quoteReserve, lpAmount);
      this.logDebug("lpAmountData:", {
        amountA: lpAmountData.amountA.toString(),
        amountB: lpAmountData.amountB.toString(),
      });
      anotherAmountFee = getTransferAmountFeeV2(
        lpAmountData[baseSpecified ? "amountB" : "amountA"],
        (baseSpecified ? poolInfo.mintB : poolInfo.mintA).extensions?.feeConfig,
        epochInfo,
        true,
      );
    }

    const _slippage = new Percent(new BN(1)).add(slippage);
    const slippageAdjustedAmount = getTransferAmountFeeV2(
      _slippage.mul(anotherAmountFee.amount.sub(anotherAmountFee.fee ?? new BN(0))).quotient,
      (baseSpecified ? poolInfo.mintB : poolInfo.mintA).extensions?.feeConfig,
      epochInfo,
      true,
    );

    this.logDebug(
      "anotherAmount:",
      anotherAmountFee.amount.toString(),
      "anotherAmountFee:",
      anotherAmountFee.fee?.toString() ?? 0,
      "maxAnotherAmount:",
      slippageAdjustedAmount.amount.toString(),
      "maxAnotherAmountFee:",
      slippageAdjustedAmount.fee?.toString() ?? 0,
    );

    return {
      inputAmountFee,
      anotherAmount: anotherAmountFee,
      maxAnotherAmount: slippageAdjustedAmount,
      liquidity,
    };
  }

  public async initializePartner<T extends TxVersion>({
    pool,
    poolKeys,
    partnerKey,
    name,
    token0TokenAccount,
    token1TokenAccount,
    computeBudgetConfig,
    txVersion,
  }: {
    pool: string;
    poolKeys: PoolKeys | undefined;
    partnerKey: PublicKey;
    name: string;
    token0TokenAccount?: PublicKey;
    token1TokenAccount?: PublicKey;
    computeBudgetConfig?: ComputeBudgetConfig;
    txVersion?: T;
  }): Promise<MakeTxData<T>> {
    const txBuilder = this.createTxBuilder();
    const keys = poolKeys ?? (await this.getCpmmPoolKeys(pool));
    const tokenAccount0 =
      token0TokenAccount ??
      this.scope.account.getAssociatedTokenAccount(new PublicKey(keys.mintA), new PublicKey(keys.mintAProgram));
    const tokenAccount1 =
      token1TokenAccount ??
      this.scope.account.getAssociatedTokenAccount(new PublicKey(keys.mintB), new PublicKey(keys.mintBProgram));
    txBuilder.addInstruction({
      instructions: [
        await makeInitializePartnerInstruction(
          this.program,
          this.scope.ownerPubKey,
          this.scope.ownerPubKey,
          new PublicKey(pool),
          partnerKey,
          name,
          tokenAccount0,
          tokenAccount1,
        ),
      ],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async addPartner<T extends TxVersion>({
    pool,
    poolKeys,
    partnerKey,
    computeBudgetConfig,
    txVersion,
  }: {
    pool: string;
    poolKeys: PoolKeys | undefined;
    partnerKey: PublicKey;
    computeBudgetConfig?: ComputeBudgetConfig;
    txVersion?: T;
  }): Promise<MakeTxData<T>> {
    const txBuilder = this.createTxBuilder();
    const keys = poolKeys ?? (await this.getCpmmPoolKeys(pool));
    txBuilder.addInstruction({
      instructions: [
        await makeAddPartnerInstruction(
          this.program,
          new PublicKey(keys.config.id),
          new PublicKey(pool),
          partnerKey,
          this.scope.ownerPubKey,
        ),
      ],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public async getRpcUserLiquidityAccounts(addresses: PublicKey[]): Promise<(UserLiquidityAccount | null)[]> {
    return await this.program.account.userPoolLiquidity.fetchMultiple(addresses);
  }

  public async getObservationStates(addresses: PublicKey[]): Promise<(CpmmObservationState | null)[]> {
    return await this.program.account.observationState.fetchMultiple(addresses);
  }
}

function lpToAmount(lp: BN, poolAmountA: BN, poolAmountB: BN, supply: BN): { amountA: BN; amountB: BN } {
  let amountA = lp.mul(poolAmountA).div(supply);
  if (!amountA.isZero() && !lp.mul(poolAmountA).mod(supply).isZero()) amountA = amountA.add(new BN(1));
  let amountB = lp.mul(poolAmountB).div(supply);
  if (!amountB.isZero() && !lp.mul(poolAmountB).mod(supply).isZero()) amountB = amountB.add(new BN(1));

  return {
    amountA,
    amountB,
  };
}
