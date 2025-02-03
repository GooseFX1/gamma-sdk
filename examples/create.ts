import dotenv from "dotenv";
dotenv.config();
import { GfxCpmmClient } from "../src/gfx/index";
import fs from "fs";
import BN from "bn.js";

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { fetchMultipleMintInfos, TxVersion } from "@/common";

const RPC_URL = process.env.RPC_URL!;
const SEND_RPC_URL = process.env.SEND_RPC_URL ?? RPC_URL;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH!;
const MINT1 = process.env.MINT1!;
const MINT2 = process.env.MINT2!;
const MINT1_AMOUNT = parseInt(process.env.MINT1_AMOUNT!);
const MINT2_AMOUNT = parseInt(process.env.MINT2_AMOUNT!);
const GAMMA_CONFIG = new PublicKey(process.env.GAMMA_CONFIG!);
const GAMMA_PROGRAM = new PublicKey(process.env.GAMMA_PROGRAM!);
const GAMMA_POOL_FEE_ACCOUNT = new PublicKey(process.env.GAMMA_POOL_FEE_ACCOUNT!);
const MICRO_LAMPORTS = parseInt(process.env.DEFAULT_CU_LAMPORTS ?? "1200000");

async function mainFn(): Promise<void> {
  const keypair = createKeypairFromFile(KEYPAIR_PATH);
  console.log("Pubkey: ", keypair.publicKey.toBase58());
  const client = await GfxCpmmClient.load({
    connection: new Connection(RPC_URL),
    disableFeatureCheck: true,
    disableLoadToken: true,
    urlConfigs: {
      BASE_HOST: "",
    },
    owner: keypair,
  });

  const mints = await fetchMultipleMintInfos({
    connection: client.connection,
    mints: [MINT1, MINT2].map((mint) => new PublicKey(mint)),
    config: {
      batchRequest: true,
    },
  });
  const mint1 = mints[MINT1];
  const mint2 = mints[MINT2];
  const feeConfig = await client.api.getConfig(GAMMA_CONFIG.toBase58());

  let { transaction } = await client.cpmm.createPool({
    programId: GAMMA_PROGRAM,
    poolFeeAccount: GAMMA_POOL_FEE_ACCOUNT,
    mintA: {
      ...mint1,
      address: mint1.address.toBase58(),
      programId: mint1.programId.toBase58(),
    },
    mintB: {
      ...mint2,
      address: mint2.address.toBase58(),
      programId: mint2.programId.toBase58(),
    },
    mintAAmount: new BN(MINT1_AMOUNT),
    mintBAmount: new BN(MINT2_AMOUNT),
    startTime: new BN(new Date().getTime() / 1000),
    maxTradeFeeRate: new BN(0),
    volatilityFactor: new BN(0),
    feeConfig,
    associatedOnly: true,
    checkCreateATAOwner: false,
    ownerInfo: {
      useSOLBalance: true,
    },
    computeBudgetConfig: {
      units: 200000,
      microLamports: MICRO_LAMPORTS,
    },
    txVersion: TxVersion.V0,
  });

  const latestBlockhash = await client.connection.getLatestBlockhash();
  transaction.message.recentBlockhash = latestBlockhash.blockhash;
  transaction.sign([
    {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    },
  ]);

  console.log("Sending createPool transaction");
  const signature = await new Connection(SEND_RPC_URL).sendTransaction(transaction as unknown as VersionedTransaction, {
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
  console.log(`createPool txn confirmed. View at https://solscan.io/tx/${signature}`);
}

export function createKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: "utf8" });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

if (require.main === module) {
  mainFn().catch(console.error);
}
