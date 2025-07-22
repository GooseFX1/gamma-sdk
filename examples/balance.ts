import dotenv from "dotenv";
dotenv.config();
import { ConstantProductCurve, getPdaUserLiquidity, GfxCpmmClient, RoundDirection } from "../src/gfx/index";
import BN from "bn.js";

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.RPC_URL!;
//const POOL_STATE = new PublicKey('39yqW5xvumoMN6LtEVaP5xjndamHacE4fKnYbQXkvJXV');
//const USER: PublicKey = new PublicKey('J2wauK6CHq1yu545m3gdy4XsE4gdjz6zX6Vt3tP2aKDR');
const POOL_STATE = new PublicKey('CyK256TZTwELBABZ8vpnAKbKo3pD8oQgvW4RSt8PCRJ8')
const USER = new PublicKey('BbSbfX9wJgj2a8uNeMqDN7DaV7HAK6fYAuYUGobXxhG3')

async function mainFn(): Promise<void> {
  const owner = Keypair.generate();
  const client = await GfxCpmmClient.load({
    connection: new Connection(RPC_URL),
    disableFeatureCheck: true,
    disableLoadToken: true,
    urlConfigs: {
      BASE_HOST: "",
    },
    owner,
  });

  const userLiquidity = getPdaUserLiquidity(client.program.programId, POOL_STATE, USER).publicKey
  const userLiquidityAccount = await client.cpmm.getRpcUserLiquidityAccounts([userLiquidity]).then((res) => res[0]);
  const pool = await client.cpmm.getPoolInfoFromRpc(POOL_STATE.toBase58());
  console.log('userLiquidity: ', userLiquidityAccount)

  const balance = ConstantProductCurve.lpTokensToTradingTokens(
    userLiquidityAccount?.lpTokensOwned ?? new BN(0),
    pool.rpcData.lpSupply,
    pool.rpcData.token0VaultAmount,
    pool.rpcData.token1VaultAmount,
    RoundDirection.Floor
  );

  console.log("Balance: ", balance);
  console.log("token0: ", balance.tokenAmount0.toNumber() / LAMPORTS_PER_SOL)
  console.log("token1: " , balance.tokenAmount1.toNumber() / LAMPORTS_PER_SOL )
}


if (require.main === module) {
  mainFn().catch(console.error);
}
