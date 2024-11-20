import { GfxCpmmClient } from '../src/gfx/index'
import { Connection } from '@solana/web3.js'

const GAMMA_CONFIG='68yDnv1sDzU3L2cek5kNEszKFPaK9yUJaC4ghV5LAXW6'
const SOL_USDC_POOL = 'Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

async function mainFn(): Promise<void> {
  const gfxClient = await GfxCpmmClient.load(
    {
      connection: new Connection(process.env.RPC_URL!),
      disableFeatureCheck: true,
      disableLoadToken: true,
      urlConfigs: {
        BASE_HOST: '',
      }
    }
  )

  const poolsById = await gfxClient.api.fetchPoolById({ ids: SOL_USDC_POOL })
  const solPools = await gfxClient.api.fetchPoolByMints({ mint1: SOL_MINT})
  const solUsdcPools = await gfxClient.api.fetchPoolByMints({ mint1: SOL_MINT, mint2: USDC_MINT})
  const poolKeys = await gfxClient.api.fetchPoolKeysById({ idList: [SOL_USDC_POOL] })
  const config = await gfxClient.api.getConfig(GAMMA_CONFIG)
  const poolList = await gfxClient.api.getPoolList()
  const jupTokenList = await gfxClient.api.getJupTokenList()
  const tokenInfo = await gfxClient.api.getTokenInfo([SOL_MINT, USDC_MINT])
}

if (require.main === module) {
  mainFn().catch(console.error)
}
