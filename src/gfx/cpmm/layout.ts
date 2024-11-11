import { array, publicKey, seq, struct, u64, u8, u16, u32, u128, blob, bool } from "@/marshmallow";

export const CpmmConfigInfoLayout = struct([
  blob(8),
  u8("bump"),
  bool("disableCreatePool"),
  u16("index"),
  u64("tradeFeeRate"),
  u64("protocolFeeRate"),
  u64("fundFeeRate"),
  u64("createPoolFee"),

  publicKey("protocolOwner"),
  publicKey("fundOwner"),
  publicKey("referralProject"),
  u64("maxOpenTime"),
  seq(u64(), 11),
]);

export const CpmmPoolInfoLayout = struct([
  blob(8),

  publicKey("configId"),
  publicKey("poolCreator"),
  publicKey("vaultA"),
  publicKey("vaultB"),

  seq(u8(), 32),
  publicKey("mintA"),
  publicKey("mintB"),

  publicKey("mintProgramA"),
  publicKey("mintProgramB"),

  publicKey("observationId"),

  u8("bump"),
  u8("status"),

  u8("_padding2"),
  u8("mintDecimalA"),
  u8("mintDecimalB"),

  u64("lpSupply"),
  u64("protocolFeesMintA"),
  u64("protocolFeesMintB"),
  u64("fundFeesMintA"),
  u64("fundFeesMintB"),
  u64("openTime"),
  u64("recentEpoch"),
  u128("cumulativeTradeFeesTokenA"),
  u128("cumulativeTradeFeesTokenB"),
  u128("cumulativeVolumeTokenA"),
  u128("cumulativeVolumeTokenB"),
  u32("filterPeriod"),
  u32("decayPeriod"),
  u32("reductionFactor"),
  u32("variableFeeControl"),
  u64("volatilityV2BaseFee"),
  u64("volatilityV2MaxFee"),
  u64("volatilityV2VolatilityFactor"),
  u64("volatilityV2ImbalanceFactor"),

  seq(u64(), 17),
]);

export const ObservationLayout = struct([
  u64("blockTimestamp"),
  u128("cumulativeToken0PriceX32"),
  u128("cumulativeToken1PriceX32")
]);

export const CpmmObservationStateLayout = struct([
  blob(8),

  bool("initialized"),
  u16("observationIndex"),
  publicKey("poolId"),
  array(ObservationLayout, 100, "observations"),
  seq(u64(), 4),
]);

export const CpmmUserPoolLiquidityLayout = struct([
  blob(8),

  publicKey("user"),
  publicKey("poolState"),
  u128("tokenADeposited"),
  u128("tokenBDeposited"),
  u128("token0Withdrawn"),
  u128("token1Withdrawn"),
  u128("lpTokensOwned"),
  publicKey("referrer")
]);