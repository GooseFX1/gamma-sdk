import dotenv from "dotenv";
dotenv.config();
import { GfxCpmmClient } from "../src/gfx/index";
import fs from "fs";
import BN from "bn.js";

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { TxVersion } from "@/common";
import { Percent } from "@/module";
import Decimal from "decimal.js-light";

const RPC_URL = process.env.RPC_URL!;
const SEND_RPC_URL = process.env.SEND_RPC_URL ?? RPC_URL;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH!;
const AMOUNT = process.env.AMOUNT!;
const POOL_STATE = new PublicKey(process.env.POOL!);
const MICRO_LAMPORTS = parseInt(process.env.DEFAULT_CU_LAMPORTS ?? "1200000");
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS ?? "1000");
const ZERO_FOR_ONE = process.env.ZERO_FOR_ONE === undefined ? true : process.env.ZERO_FOR_ONE === "true";

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
  const slippage = new Percent(new BN(SLIPPAGE_BPS), new BN(10000));
  const compute = client.cpmm.computePairAmount({
    poolInfo: info.poolInfo,
    baseReserve: info.rpcData.baseReserve,
    quoteReserve: info.rpcData.quoteReserve,
    slippage,
    zeroForOne: ZERO_FOR_ONE,
    amount: new Decimal(AMOUNT.toString())
      .div(10 ** (ZERO_FOR_ONE ? info.poolInfo.mintA.decimals : info.poolInfo.mintB.decimals))
      .toString(),
    epochInfo: await client.connection.getEpochInfo(),
  });

  let { transaction: addTxn } = await client.cpmm.addLiquidity({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    payer: keypair.publicKey,
    inputAmount: new BN(AMOUNT),
    zeroForOne: ZERO_FOR_ONE,
    slippage,
    computeResult: compute,
    computeBudgetConfig: {
      microLamports: MICRO_LAMPORTS,
    },
    txVersion: TxVersion.V0,
  });

  let latestBlockhash = await client.connection.getLatestBlockhash();
  addTxn.message.recentBlockhash = latestBlockhash.blockhash;
  addTxn.sign([
    {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    },
  ]);

  const sendConnection = new Connection(SEND_RPC_URL);
  console.log("Sending addLiquidity transaction");
  let signature = await sendConnection.sendTransaction(addTxn as unknown as VersionedTransaction, {
    skipPreflight: true,
    preflightCommitment: "confirmed",
    maxRetries: 0,
  });
  console.log(`Waiting to confirm transaction ${signature}`);

  await client.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log(`addLiquidity txn confirmed. View at https://solscan.io/tx/${signature}`);

  latestBlockhash = await client.connection.getLatestBlockhash();
  let { transaction: withdrawTxn } = await client.cpmm.withdrawLiquidity({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    payer: keypair.publicKey,
    lpAmount: compute.liquidity,
    slippage,
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      microLamports: MICRO_LAMPORTS,
    },
  });
  withdrawTxn.message.recentBlockhash = latestBlockhash.blockhash;
  withdrawTxn.sign([
    {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    },
  ]);

  console.log("Sending removeLiquidity transaction");
  signature = await sendConnection.sendTransaction(withdrawTxn as unknown as VersionedTransaction, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 0,
  });
  console.log(`Waiting to confirm transaction ${signature}`);

  await client.connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );
  console.log(`removeLiquidity txn confirmed. View at https://solscan.io/tx/${signature}`);
}

export function createKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: "utf8" });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

if (require.main === module) {
  mainFn().catch(console.error);
}
