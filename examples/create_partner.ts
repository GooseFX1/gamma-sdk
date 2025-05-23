import dotenv from "dotenv";
dotenv.config();
import { GfxCpmmClient } from "../src/gfx/index";
import fs from "fs";

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { TxVersion } from "@/common";

const RPC_URL = process.env.RPC_URL!;
const SEND_RPC_URL = process.env.SEND_RPC_URL ?? RPC_URL;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH!;
const POOL_STATE = process.env.POOL_STATE!;
const PARTNER_NAME = process.env.PARTNER_NAME ?? "test_partner";
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

  const info = await client.cpmm.getPoolInfoFromRpc(POOL_STATE);
  const partner = Keypair.generate();
  console.log(`Initializing partner with pubkey: ${partner.publicKey.toBase58()}`);

  let { transaction } = await client.cpmm.initializePartner({
    pool: POOL_STATE,
    poolKeys: info.poolKeys,
    partnerKey: partner.publicKey,
    name: PARTNER_NAME,
    computeBudgetConfig: {
      units: 200000,
      microLamports: MICRO_LAMPORTS,
    },
    txVersion: TxVersion.V0,
  });

  const latestBlockhash = await client.connection.getLatestBlockhash();
  transaction.message.recentBlockhash = latestBlockhash.blockhash;
  transaction.sign([keypair, partner]);

  console.log("Sending createPartner transaction");
  const signature = await new Connection(SEND_RPC_URL).sendTransaction(transaction as unknown as VersionedTransaction, {
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
  console.log(`createPartner txn confirmed. View at https://solscan.io/tx/${signature}`);
  console.log(`Partner account: https://solscan.io/account/${partner.publicKey.toBase58()}`);
}

export function createKeypairFromFile(filePath: string): Keypair {
  const secretKeyString = fs.readFileSync(filePath, { encoding: "utf8" });
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

if (require.main === module) {
  mainFn().catch(console.error);
}
