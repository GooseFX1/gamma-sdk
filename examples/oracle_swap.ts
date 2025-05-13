import dotenv from "dotenv";
dotenv.config();
import { GfxCpmmClient } from "../src/gfx/index";
import fs from "fs";
import BN from "bn.js";

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { TxVersion } from "@/common";
import { OracleBasedCurveCalculator } from "@/gfx/cpmm/curve/oracleCalculator";

const RPC_URL = process.env.RPC_URL!;
const SEND_RPC_URL = process.env.SEND_RPC_URL ?? RPC_URL;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH!;
const AMOUNT = new BN(process.env.AMOUNT ?? '1_000_000');
const POOL_STATE = new PublicKey(process.env.POOL!);
const MICRO_LAMPORTS = parseInt(process.env.DEFAULT_CU_LAMPORTS ?? "500000");
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS ?? "1000");
const ZERO_FOR_ONE = false;

async function mainFn(): Promise<void> {
  const keypair = createKeypairFromFile(KEYPAIR_PATH);
  const client = await GfxCpmmClient.load({
    connection: new Connection(RPC_URL),
    disableFeatureCheck: true,
    disableLoadToken: true,
    urlConfigs: {
      BASE_HOST: "",
    },
    owner: keypair,
  });

  const info = await client.cpmm.getPoolInfoFromRpc(POOL_STATE.toBase58());
  const observationState = await client.cpmm.getObservationStates([info.rpcData.observationKey]).then((res) => res[0]);

  const swapResult = OracleBasedCurveCalculator.swap(
    AMOUNT,
    ZERO_FOR_ONE,
    info.rpcData.baseReserve,
    info.rpcData.quoteReserve,
    info.rpcData.configInfo!.tradeFeeRate,
    observationState!,
    info.rpcData,
  );
  console.log("swapResult", swapResult);

  console.log("swapResult, sourceAmountSwapped", swapResult.sourceAmountSwapped.toNumber());
  console.log("swapResult destinationAmountSwapped", swapResult.destinationAmountSwapped.toNumber() / 10 ** 9);

  const { transaction } = await client.cpmm.swapWithOracle({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    zeroForOne: ZERO_FOR_ONE,
    inputAmount: AMOUNT,
    swapResult,
    slippage: SLIPPAGE_BPS / 10_000,
    computeBudgetConfig: {
      microLamports: MICRO_LAMPORTS,
    },
    txVersion: TxVersion.V0,
    wrapSol: false,
  });

  const { blockhash, lastValidBlockHeight } = await client.connection.getLatestBlockhash();
  transaction.message.recentBlockhash = blockhash;
  transaction.sign([
    {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    },
  ]);

  console.log("Sending swap transaction");
  const signature = await new Connection(SEND_RPC_URL).sendTransaction(transaction as unknown as VersionedTransaction, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 0,
  });
  console.log(`Waiting to confirm transaction ${signature}`);

  await client.connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log(`swap txn confirmed. View at https://solscan.io/tx/${signature}`);
}

export function createKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: "utf8" });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

if (require.main === module) {
  mainFn().catch(console.error);
}
