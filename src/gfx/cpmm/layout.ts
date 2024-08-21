import { publicKey, seq, struct, u64, u8, u16, u128, blob, bool } from "@/marshmallow";

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
  seq(u64(), 16),
]);

export const CpmmPoolInfoLayout = struct([
  blob(8),

  publicKey("configId"),
  publicKey("poolCreator"),
  publicKey("vaultA"),
  publicKey("vaultB"),

  publicKey("mintLp"),
  publicKey("mintA"),
  publicKey("mintB"),

  publicKey("mintProgramA"),
  publicKey("mintProgramB"),

  publicKey("observationId"),

  u8("bump"),
  u8("status"),

  u8("lpDecimals"),
  u8("mintDecimalA"),
  u8("mintDecimalB"),

  u64("lpAmount"),
  u64("protocolFeesMintA"),
  u64("protocolFeesMintB"),
  u64("fundFeesMintA"),
  u64("fundFeesMintB"),
  u64("openTime"),
  u64("recentEpoch"),
  u128("tradeFeesTokenA"),
  u128("tradeFeesTokenB"),
  u128("cumulativeVolumeTokenA"),
  u128("cumulativeVolumeTokenB"),

  seq(u64(), 23),
]);
