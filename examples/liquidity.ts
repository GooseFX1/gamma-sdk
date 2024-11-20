import { GfxCpmmClient } from '../src/gfx/index'
import fs from 'fs'
import BN from "bn.js"

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import { TxVersion } from "@/common"
import { Percent } from '@/module'
import Decimal from 'decimal.js-light'

const SOL = 'So11111111111111111111111111111111111111112'
const SOL_USDC_POOL = 'Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'

async function mainFn(): Promise<void> {
  const keypair = createKeypairFromFile("./keys.json")
  const client = await GfxCpmmClient.load(
    {
      connection: new Connection(process.env.RPC_URL!),
      disableFeatureCheck: true,
      disableLoadToken: true,
      urlConfigs: {
        BASE_HOST: '',
      },
      owner: keypair
    }
  )

  const info = await client.cpmm.getPoolInfoFromRpc(SOL_USDC_POOL)
  const amountIn = new BN(1000)
  const slippage = new Percent(new BN(5), new BN(10))
  const baseIn = info.poolInfo.mintA.address == SOL
  const compute = client.cpmm.computePairAmount({
    poolInfo: info.poolInfo,
    baseReserve: info.rpcData.baseReserve,
    quoteReserve: info.rpcData.quoteReserve,
    slippage,
    baseIn,
    amount: new Decimal(amountIn.toString()).div(
      10 ** (baseIn ? info.poolInfo.mintA.decimals : info.poolInfo.mintB.decimals),
    ).toString(),
    epochInfo: await client.connection.getEpochInfo()
  })

  let { transaction: addTxn } = await client.cpmm.addLiquidity({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    payer: keypair.publicKey,
    inputAmount: amountIn,
    baseIn: info.poolInfo.mintA.address == SOL,
    slippage,
    computeResult: compute,
    computeBudgetConfig: {
      microLamports: 800000
    },
    txVersion: TxVersion.V0
  })

  let latestBlockhash = await client.connection.getLatestBlockhash()
  addTxn.message.recentBlockhash = latestBlockhash.blockhash
  addTxn.sign([{
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey
  }])

  console.log("Sending addLiquidity transaction")
  let signature = await client.connection.sendTransaction(
    addTxn as unknown as VersionedTransaction,
    {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    }
  )
  console.log(`Waiting to confirm transaction ${signature}`)

  await client.connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
  }, 'confirmed')
  console.log(`addLiquidity txn confirmed. View at https://solscan.io/tx/${signature}`)

  latestBlockhash = await client.connection.getLatestBlockhash()
  let { transaction: withdrawTxn } = await client.cpmm.withdrawLiquidity({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    payer: keypair.publicKey,
    lpAmount: compute.liquidity,
    slippage,
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      microLamports: 800000
    },
  }) 
  withdrawTxn.message.recentBlockhash = latestBlockhash.blockhash
  withdrawTxn.sign([{
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey
  }])

  console.log("Sending removeLiquidity transaction")
  signature = await client.connection.sendTransaction(
    withdrawTxn as unknown as VersionedTransaction,
    {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    }
  )
  console.log(`Waiting to confirm transaction ${signature}`)

  await client.connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
  }, 'confirmed')
  console.log(`removeLiquidity txn confirmed. View at https://solscan.io/tx/${signature}`)
}

export function createKeypairFromFile(
  filePath: string
): Keypair {
  const secretKeyString = fs.readFileSync(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

if (require.main === module) {
  mainFn().catch(console.error)
}
