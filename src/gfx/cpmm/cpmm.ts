import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, AccountLayout, createSyncNativeInstruction } from "@solana/spl-token";
import { PoolInfo, PoolKeys, PoolStats } from "@/api/type";
import { Percent } from "@/module";
import { BN_ZERO } from "@/common/number";
import { WSOLMint } from "@/common/pubKey";
import { InstructionType, TxVersion } from "@/common/txTool/txType";
import { MakeTxData } from "@/common/txTool/txTool";
import { CurveCalculator } from "./curve/calculator";

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
} from "./type";
import { getCreatePoolKeys, getPdaObservationId, getPdaUserLiquidity } from "./pda";
import {
  makeCreateCpmmPoolInInstruction,
  makeDepositCpmmInInstruction,
  makeInitUserPoolLiquidityInstruction,
  makeWithdrawCpmmInInstruction,
  makeSwapCpmmBaseInInInstruction,
  makeSwapCpmmBaseOutInInstruction,
} from "./instruction";
import BN from "bn.js";
import { CpmmPoolInfoLayout, CpmmConfigInfoLayout, CpmmUserPoolLiquidityLayout, CpmmObservationStateLayout } from "./layout";
import Decimal from "decimal.js";
import { fetchMultipleMintInfos, getMultipleAccountsInfoWithCustomFlags, getTransferAmountFeeV2 } from "@/common";
import { GetTransferAmountFee, ReturnTypeFetchMultipleMintInfos } from "@/gfx/type";
import { toGammaApiToken, toFeeConfig, SOL_INFO } from "../token";
import { getPdaPoolAuthority } from "./pda";

export default class CpmmModule extends ModuleBase {
  constructor(params: ModuleBaseProps) {
    super(params);
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

  public async getRpcPoolInfos(
    poolIds: string[],
    fetchConfigInfo?: boolean,
  ): Promise<{
    [poolId: string]: CpmmRpcData;
  }> {
    const accounts = await getMultipleAccountsInfoWithCustomFlags(
      this.scope.connection,
      poolIds.map((i) => ({ pubkey: new PublicKey(i) })),
    );
    const poolInfos: { [poolId: string]: ReturnType<typeof CpmmPoolInfoLayout.decode> & { programId: PublicKey } } = {};

    const needFetchConfigId = new Set<string>();

    for (let i = 0; i < poolIds.length; i++) {
      const item = accounts[i];
      if (item.accountInfo === null) throw Error("fetch pool info error: " + String(poolIds[i]));
      const rpc = CpmmPoolInfoLayout.decode(item.accountInfo.data);
      poolInfos[String(poolIds[i])] = {
        ...rpc,
        programId: item.accountInfo.owner,
      };
      needFetchConfigId.add(String(rpc.configId));
    }

    const configInfo: { [configId: string]: ReturnType<typeof CpmmConfigInfoLayout.decode> } = {};

    if (fetchConfigInfo) {
      const configIds = [...needFetchConfigId];
      const configState = await getMultipleAccountsInfoWithCustomFlags(
        this.scope.connection,
        configIds.map((i) => ({ pubkey: new PublicKey(i) })),
      );

      for (let i = 0; i < configIds.length; i++) {
        const configItemInfo = configState[i].accountInfo;
        if (configItemInfo === null) throw Error("fetch pool config error: " + configIds[i]);
        configInfo[configIds[i]] = CpmmConfigInfoLayout.decode(configItemInfo.data);
      }
    }

    const returnData: { [poolId: string]: CpmmRpcData } = {};

    for (const [id, info] of Object.entries(poolInfos)) {
      const baseReserve = info.tokenAVaultAmount
      const quoteReserve = info.tokenBVaultAmount
      returnData[id] = {
        ...info,
        baseReserve: info.tokenAVaultAmount,
        quoteReserve: info.tokenBVaultAmount,
        vaultAAmount: info.tokenAVaultAmount.add(info.protocolFeesMintA).add(info.fundFeesMintA),
        vaultBAmount: info.tokenBVaultAmount.add(info.protocolFeesMintB).add(info.fundFeesMintB),
        configInfo: configInfo[info.configId.toString()],
        poolPrice: new Decimal(quoteReserve.toString())
          .div(new Decimal(10).pow(info.mintDecimalB))
          .div(new Decimal(baseReserve.toString()).div(new Decimal(10).pow(info.mintDecimalA))),
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
      const [mintA, mintB] = [pool.mintA.toBase58(), pool.mintB.toBase58()];

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
            decimals: pool.mintDecimalA,
            programId: pool.mintProgramA.toBase58(),
            extensions: {
              feeConfig: mintInfos[mintA]?.feeConfig ? toFeeConfig(mintInfos[mintA]?.feeConfig) : undefined,
            },
          }),
          mintB: toGammaApiToken({
            address: mintB,
            decimals: pool.mintDecimalB,
            programId: pool.mintProgramB.toBase58(),
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
    const mintInfos = await fetchMultipleMintInfos({
      connection: this.scope.connection,
      mints: [rpcData.mintA, rpcData.mintB],
    });

    const mintA = toGammaApiToken({
      address: rpcData.mintA.toBase58(),
      decimals: rpcData.mintDecimalA,
      programId: rpcData.mintProgramA.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintA.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintA.toBase58()].feeConfig)
          : undefined,
      },
    });
    const mintB = toGammaApiToken({
      address: rpcData.mintB.toBase58(),
      decimals: rpcData.mintDecimalB,
      programId: rpcData.mintProgramB.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintB.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintB.toBase58()].feeConfig)
          : undefined,
      },
    });

    const configInfo = {
      id: rpcData.configId.toBase58(),
      index: rpcData.configInfo!.index,
      protocolFeeRate: rpcData.configInfo!.protocolFeeRate.toNumber(),
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
      fundFeeRate: rpcData.configInfo!.fundFeeRate.toNumber(),
      createPoolFee: rpcData.configInfo!.createPoolFee.toString(),
      protocolOwner: rpcData.configInfo!.protocolOwner.toString(),
      fundOwner: rpcData.configInfo!.fundOwner.toString()
    };

    const mockPoolStats: PoolStats = {
      range: '24H',
      feesUSD: 0,
      volumeTokenAUSD: 0,
      volumeTokenBUSD: 0,
      feesAprUSD: 0,
      volumeAprUSD: 0
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
        poolType: 'hyper',
        mintAVault: rpcData.vaultA.toBase58(),
        mintBVault: rpcData.vaultA.toBase58(),
        authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
        // feeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
        openTime: rpcData.openTime.toString(),
        tvl: '0',
        stats: {
          daily: mockPoolStats,
          weekly: mockPoolStats,
          monthly: mockPoolStats,
        }
      },
      poolKeys: {
        programId: rpcData.programId.toBase58(),
        id: poolId,
        mintA: mintA.address,
        mintB: mintB.address,
        openTime: rpcData.openTime.toString(),
        mintAVault: rpcData.vaultA.toBase58(),
        mintBVault: rpcData.vaultB.toBase58(),
        authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
        config: configInfo,
        mintAProgram: rpcData.mintProgramA.toBase58(),
        mintBProgram: rpcData.mintProgramB.toBase58(),
        poolType: 'hyper'
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

    if (userVaultA === undefined || userVaultB === undefined) throw Error("One or both of user's token account does not exist");

    const poolKeys = getCreatePoolKeys({
      programId,
      configId: new PublicKey(feeConfig.id),
      mintA: mintAPubkey,
      mintB: mintBPubkey,
    });
    const userLiquidityPda = getPdaUserLiquidity(new PublicKey(programId), new PublicKey(poolKeys.poolId), this.scope.ownerPubKey)

    txBuilder.addInstruction({
      instructions: [
        makeCreateCpmmPoolInInstruction(
          programId,
          this.scope.ownerPubKey,
          new PublicKey(feeConfig.id),
          poolKeys.authority,
          poolKeys.poolId,
          userLiquidityPda.publicKey,
          mintAPubkey,
          mintBPubkey,
          userVaultA,
          userVaultB,
          poolKeys.vaultA,
          poolKeys.vaultB,
          poolFeeAccount,
          new PublicKey(mintA.programId ?? TOKEN_PROGRAM_ID),
          new PublicKey(mintB.programId ?? TOKEN_PROGRAM_ID),
          poolKeys.observationId,
          mintAAmount,
          mintBAmount,
          startTime,
          maxTradeFeeRate,
          volatilityFactor
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
      baseIn,
      slippage,
      computeResult,
      computeBudgetConfig,
      config,
      txVersion,
      partner
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
      baseIn,
      epochInfo: await this.scope.fetchEpochInfo(),
      amount: new Decimal(inputAmount.toString()).div(
        10 ** (baseIn ? poolInfo.mintA.decimals : poolInfo.mintB.decimals),
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
          mintAUseSOLBalance || (baseIn ? inputAmount : anotherAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? inputAmount : anotherAmount,
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
          mintBUseSOLBalance || (baseIn ? anotherAmount : inputAmount).isZero()
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? anotherAmount : inputAmount,
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
    const userLiquidityPda = getPdaUserLiquidity(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id), this.scope.ownerPubKey)
    const userLiquidity = await this.getRpcUserLiquidityAccounts([userLiquidityPda.publicKey]).then((a) => a[0])
    if (!userLiquidity) {
      txBuilder.addInstruction({
        instructions: [
          makeInitUserPoolLiquidityInstruction(
            new PublicKey(poolInfo.programId),
            this.scope.ownerPubKey,
            new PublicKey(poolInfo.id),
            userLiquidityPda.publicKey,
            partner ? partner : null
          )
        ],
        instructionTypes: [InstructionType.CpmmInitUserLiquidity],
        lookupTableAddress: []
      })
    }

    const _slippage = new Percent(new BN(1)).sub(slippage);

    txBuilder.addInstruction({
      instructions: [
        makeDepositCpmmInInstruction(
          new PublicKey(poolInfo.programId),
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.authority),
          new PublicKey(poolInfo.id),
          userLiquidityPda.publicKey,
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.mintAVault),
          new PublicKey(poolKeys.mintBVault),
          mintA,
          mintB,

          computeResult ? computeResult?.liquidity : _slippage.mul(liquidity).quotient,
          baseIn ? inputAmountFee.amount : anotherAmount,
          baseIn ? anotherAmount : inputAmountFee.amount,
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

    // if (this.scope.availability.addStandardPosition === false)
    //   this.logAndCreateError("add liquidity feature disabled in your region");

    const _slippage = new Percent(new BN(1)).sub(slippage);

    const rpcPoolData = await this.getRpcPoolInfo(poolInfo.id);
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
        makeWithdrawCpmmInInstruction(
          new PublicKey(poolInfo.programId),
          this.scope.ownerPubKey,
          new PublicKey(poolKeys.authority),
          new PublicKey(poolInfo.id),
          userLiquidityPda.publicKey,
          tokenAccountA!,
          tokenAccountB!,
          new PublicKey(poolKeys.mintAVault),
          new PublicKey(poolKeys.mintBVault),
          mintA,
          mintB,

          lpAmount,
          amountMintA.sub(mintAAmountFee.fee ?? new BN(0)),
          amountMintB.sub(mintBAmountFee.fee ?? new BN(0)),
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
      baseIn,
      fixedOut,
      inputAmount,
      swapResult,
      slippage = 0,
      config,
      computeBudgetConfig,
      txVersion,
      wrapSol
    } = params;

    const { bypassAssociatedCheck, checkCreateATAOwner, associatedOnly } = {
      // default
      ...{ bypassAssociatedCheck: false, checkCreateATAOwner: false, associatedOnly: true },
      // custom
      ...config,
    };

    const txBuilder = this.createTxBuilder();

    const [mintA, mintB] = [new PublicKey(poolInfo.mintA.address), new PublicKey(poolInfo.mintB.address)];

    if (!fixedOut) {
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
          mintAUseSOLBalance || !baseIn
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? swapResult.sourceAmountSwapped : 0,
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
          mintBUseSOLBalance || baseIn
            ? {
                payer: this.scope.ownerPubKey,
                amount: baseIn ? 0 : swapResult.sourceAmountSwapped,
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

    const inputMint = baseIn ? poolInfo.mintA.address : poolInfo.mintB.address
    if (wrapSol && inputMint === SOL_INFO.address) {
      txBuilder.addInstruction({
        instructions: [
          createSyncNativeInstruction(new PublicKey(baseIn ? mintATokenAcc! : mintBTokenAcc!))
        ],
      })
    }

    txBuilder.addInstruction({
      instructions: [
        !fixedOut
          ? makeSwapCpmmBaseInInInstruction(
              new PublicKey(poolInfo.programId),
              this.scope.ownerPubKey,
              new PublicKey(poolKeys.authority),
              new PublicKey(poolKeys.config.id),
              new PublicKey(poolInfo.id),
              baseIn ? mintATokenAcc! : mintBTokenAcc!,
              baseIn ? mintBTokenAcc! : mintATokenAcc!,
              new PublicKey(baseIn ? poolKeys.mintAVault : poolKeys.mintBVault),
              new PublicKey(baseIn ? poolKeys.mintBVault : poolKeys.mintAVault),
              new PublicKey(baseIn ? poolKeys.mintAProgram : poolKeys.mintBProgram),
              new PublicKey(baseIn ? poolKeys.mintBProgram : poolKeys.mintAProgram),
              baseIn ? mintA : mintB,
              baseIn ? mintB : mintA,
              getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

              inputAmount,
              swapResult.destinationAmountSwapped,
              params.dflowSegmenterOptions,
            )
          : makeSwapCpmmBaseOutInInstruction(
              new PublicKey(poolInfo.programId),
              this.scope.ownerPubKey,
              new PublicKey(poolKeys.authority),
              new PublicKey(poolKeys.config.id),
              new PublicKey(poolInfo.id),

              baseIn ? mintATokenAcc! : mintBTokenAcc!,
              baseIn ? mintBTokenAcc! : mintATokenAcc!,

              new PublicKey(baseIn ? poolKeys.mintAVault : poolKeys.mintBVault),
              new PublicKey(baseIn ? poolKeys.mintBVault : poolKeys.mintAVault),
              new PublicKey(baseIn ? poolKeys.mintAProgram : poolKeys.mintBProgram),
              new PublicKey(baseIn ? poolKeys.mintBProgram : poolKeys.mintAProgram),
              baseIn ? mintA : mintB,
              baseIn ? mintB : mintA,

              getPdaObservationId(new PublicKey(poolInfo.programId), new PublicKey(poolInfo.id)).publicKey,

              swapResult.sourceAmountSwapped,
              swapResult.destinationAmountSwapped,
              params.dflowSegmenterOptions,
            ),
      ],
      instructionTypes: [fixedOut ? InstructionType.CpmmSwapBaseOut : InstructionType.CpmmSwapBaseIn],
    });

    txBuilder.addCustomComputeBudget(computeBudgetConfig);

    return txBuilder.versionBuild({ txVersion }) as Promise<MakeTxData<T>>;
  }

  public computeSwapAmount({
    pool,
    amountIn,
    outputMint,
    slippage,
    observationState,
  }: {
    pool: CpmmComputeData;
    amountIn: BN;
    outputMint: string | PublicKey;
    slippage: number;
    observationState: CpmmObservationState;
  }): {
    allTrade: boolean;
    amountIn: BN;
    amountOut: BN;
    minAmountOut: BN;
    fee: BN;
    executionPrice: Decimal;
    priceImpact: any;
  } {
    const baseIn = outputMint.toString() === pool.mintB.address;

    const swapResult = CurveCalculator.swap(
      amountIn,
      baseIn ? pool.baseReserve : pool.quoteReserve,
      baseIn ? pool.quoteReserve : pool.baseReserve,
      pool.configInfo.tradeFeeRate,
      observationState
    );

    const currentPrice = baseIn ? pool.poolPrice : new Decimal(1).div(pool.poolPrice);
    const [numDecimals, denomDecimals] = baseIn ? [pool.mintB.decimals, pool.mintA.decimals] : [pool.mintA.decimals, pool.mintB.decimals];
    const numerator = new Decimal(swapResult.destinationAmountSwapped.toString()).div(
      new Decimal(10).pow(numDecimals),
    );
    const denominator = new Decimal(swapResult.sourceAmountSwapped.toString()).div(
      new Decimal(10).pow(denomDecimals),
    );
    const executionPrice = numerator.div(denominator);

    const minAmountOut = swapResult.destinationAmountSwapped.mul(new BN((1 - slippage) * 10000)).div(new BN(10000));

    return {
      allTrade: swapResult.sourceAmountSwapped.eq(amountIn),
      amountIn,
      amountOut: swapResult.destinationAmountSwapped,
      minAmountOut,
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
    baseIn,
  }: ComputePairAmountParams): {
    inputAmountFee: GetTransferAmountFee;
    anotherAmount: GetTransferAmountFee;
    maxAnotherAmount: GetTransferAmountFee;
    liquidity: BN;
  } {
    const coefficient = 1 - Number(slippage.toSignificant()) / 100;
    const inputAmount = new BN(
      new Decimal(amount)
        .mul(10 ** poolInfo[baseIn ? "mintA" : "mintB"].decimals)
        .mul(coefficient)
        .toFixed(0),
    );
    const inputAmountFee = getTransferAmountFeeV2(
      inputAmount,
      (baseIn ? poolInfo.mintA : poolInfo.mintB).extensions?.feeConfig,
      epochInfo,
      false,
    );
    const _inputAmountWithoutFee = inputAmount.sub(inputAmountFee.fee ?? new BN(0));

    const lpAmount = new BN(poolInfo.lpSupply ?? '0');
    this.logDebug("baseReserve:", baseReserve.toString(), "quoteReserve:", quoteReserve.toString());

    this.logDebug(
      "tokenIn:",
      baseIn ? poolInfo.mintA.symbol : poolInfo.mintB.symbol,
      "amountIn:",
      inputAmount.toString(),
      "amountInFee:",
      inputAmountFee.fee?.toString() ?? 0,
      "anotherToken:",
      baseIn ? poolInfo.mintB.symbol : poolInfo.mintA.symbol,
      "slippage:",
      `${slippage.toSignificant()}%`,
    );

    // input is fixed
    const input = baseIn ? "base" : "quote";
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
        lpAmountData[baseIn ? "amountB" : "amountA"],
        (baseIn ? poolInfo.mintB : poolInfo.mintA).extensions?.feeConfig,
        epochInfo,
        true,
      );
    }

    const _slippage = new Percent(new BN(1)).add(slippage);
    const slippageAdjustedAmount = getTransferAmountFeeV2(
      _slippage.mul(anotherAmountFee.amount.sub(anotherAmountFee.fee ?? new BN(0))).quotient,
      (baseIn ? poolInfo.mintB : poolInfo.mintA).extensions?.feeConfig,
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

  public async getRpcUserLiquidityAccounts(addresses: PublicKey[]): Promise<(UserLiquidityAccount | null)[]> {
    const accounts = await getMultipleAccountsInfoWithCustomFlags(
      this.scope.connection,
      addresses.map((i) => ({ pubkey: new PublicKey(i) }))
    );

    return accounts.map((acc) => {
      if (acc.accountInfo === null) {
        return null
      } else {
        return CpmmUserPoolLiquidityLayout.decode(acc.accountInfo.data)
      }
    })
  }

  public async getObservationStates(addresses: PublicKey[]): Promise<(CpmmObservationState | null)[]> {
    const accounts = await getMultipleAccountsInfoWithCustomFlags(
      this.scope.connection,
      addresses.map((i) => ({ pubkey: new PublicKey(i) }))
    );

    return accounts.map((acc) => {
      if (acc.accountInfo === null) {
        return null
      } else {
        return CpmmObservationStateLayout.decode(acc.accountInfo.data)
      }
    })
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
