import { PublicKey } from "@solana/web3.js";
import { findProgramAddress } from "@/common/txTool/txUtils";

const AUTH_SEED = Buffer.from("vault_and_lp_mint_auth_seed", "utf8");
const AMM_CONFIG_SEED = Buffer.from("amm_config", "utf8");
const POOL_SEED = Buffer.from("pool", "utf8");
const POOL_LP_MINT_SEED = Buffer.from("pool_lp_mint", "utf8");
const POOL_VAULT_SEED = Buffer.from("pool_vault", "utf8");
const OBSERVATION_SEED = Buffer.from("observation", "utf8");
const USER_POOL_LIQUIDITY_SEED = Buffer.from("user-pool-liquidity", "utf8");
const GLOBAL_REWARD_INFO_SEED = Buffer.from("global_reward_info_seed", "utf8");
const GLOBAL_USER_LP_RECENT_CHANGE_SEED = Buffer.from("global_user_lp_seed", "utf8");

export function getPdaPoolAuthority(programId: PublicKey): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([AUTH_SEED], programId);
}

export function getCpmmPdaAmmConfigId(
  programId: PublicKey,
  index: number,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([AMM_CONFIG_SEED, u16ToBytes(index)], programId);
}

export function getCpmmPdaPoolId(
  programId: PublicKey,
  ammConfigId: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_SEED, ammConfigId.toBuffer(), mintA.toBuffer(), mintB.toBuffer()], programId);
}

export function getPdaLpMint(
  programId: PublicKey,
  poolId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_LP_MINT_SEED, poolId.toBuffer()], programId);
}

export function getPdaVault(
  programId: PublicKey,
  poolId: PublicKey,
  mint: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([POOL_VAULT_SEED, poolId.toBuffer(), mint.toBuffer()], programId);
}

export function getPdaObservationId(
  programId: PublicKey,
  poolId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([OBSERVATION_SEED, poolId.toBuffer()], programId);
}

export function getPdaUserLiquidity(
  programId: PublicKey,
  poolId: PublicKey,
  owner: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([USER_POOL_LIQUIDITY_SEED, poolId.toBuffer(), owner.toBuffer()], programId);
}

export function getPdaGlobalRewardInfo(
  programId: PublicKey,
  poolId: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([GLOBAL_REWARD_INFO_SEED, poolId.toBuffer()], programId);
}

export function getPdaGlobalUserLpRecentChange(
  programId: PublicKey,
  poolId: PublicKey,
  user: PublicKey,
): {
  publicKey: PublicKey;
  nonce: number;
} {
  return findProgramAddress([GLOBAL_USER_LP_RECENT_CHANGE_SEED, poolId.toBuffer(), user.toBuffer()], programId);
}

function u16ToBytes(num: number): Uint8Array {
  const arr = new ArrayBuffer(2);
  const view = new DataView(arr);
  view.setUint16(0, num, false);
  return new Uint8Array(arr);
}

export function getCreatePoolKeys({
  programId,
  configId,
  mintA,
  mintB,
}: {
  programId: PublicKey;
  configId: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
}): {
  poolId: PublicKey;
  configId: PublicKey;
  authority: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
} {
  const authority = getPdaPoolAuthority(programId).publicKey;
  const poolId = getCpmmPdaPoolId(programId, configId, mintA, mintB).publicKey;
  const vaultA = getPdaVault(programId, poolId, mintA).publicKey;
  const vaultB = getPdaVault(programId, poolId, mintB).publicKey;
  const observationId = getPdaObservationId(programId, poolId).publicKey;

  return {
    poolId,
    configId,
    authority,
    vaultA,
    vaultB,
    observationId,
  };
}
