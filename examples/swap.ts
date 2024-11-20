import { CurveCalculator, GfxCpmmClient } from '../src/gfx/index'
import fs from 'fs'
import BN from "bn.js"

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'
import { TxVersion } from "@/common"

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
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

  const amountIn = new BN(1000)
  const info = await client.cpmm.getPoolInfoFromRpc(SOL_USDC_POOL)
  const baseIn = info.poolInfo.mintA.address == SOL_MINT
  const observationState = await client.cpmm.getObservationStates([info.rpcData.observationId]).then((res) => res[0])

  const swapResult = CurveCalculator.swap(
    amountIn,
    baseIn ? info.rpcData.baseReserve : info.rpcData.quoteReserve,
    baseIn ? info.rpcData.quoteReserve : info.rpcData.baseReserve,
    info.rpcData.configInfo!.tradeFeeRate,
    observationState!
  );

  const { transaction } = await client.cpmm.swap({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    baseIn: info.poolInfo.mintA.address === USDC_MINT,
    inputAmount: amountIn,
    swapResult,
    slippage: 0.5, // 50%,
    computeBudgetConfig: {
      microLamports: 6000000
    },
    txVersion: TxVersion.V0,
    wrapSol: true
  })

  const { blockhash, lastValidBlockHeight } = await client.connection.getLatestBlockhash()
  transaction.message.recentBlockhash = blockhash
  transaction.sign([{
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey
  }])

  console.log("Sending swap transaction")
  let signature = await client.connection.sendTransaction(
    transaction as unknown as VersionedTransaction,
    {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
      maxRetries: 0,
    }
  )
  console.log(`Waiting to confirm transaction ${signature}`)

  await client.connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight
  }, 'confirmed')
  console.log(`swap txn confirmed. View at https://solscan.io/tx/${signature}`)
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
