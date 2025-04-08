import { GfxCpmmClient } from "../src/gfx/index";
import { Connection } from "@solana/web3.js";

const GAMMA_CONFIG = "68yDnv1sDzU3L2cek5kNEszKFPaK9yUJaC4ghV5LAXW6";
const POOL_STATE = "Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng";
const MINT1 = "So11111111111111111111111111111111111111112";
const MINT2 = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function mainFn(): Promise<void> {
  const gfxClient = await GfxCpmmClient.load({
    connection: new Connection(process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com"),
    disableFeatureCheck: true,
    disableLoadToken: true,
    urlConfigs: {},
  });

  try {
    const poolsById = await gfxClient.api.fetchPoolById({ idList: [POOL_STATE] });
    console.log(`poolsById: `, poolsById);
  } catch (err) {
    console.log(`pools-by-id req failed: ${err}`);
  }

  try {
    const mint1Pools = await gfxClient.api.fetchPoolByMints({ mint1: MINT1 });
    console.log(`mint1Pools: `, mint1Pools);
  } catch (err) {
    console.log(`pool-by-mints req failed: ${err}`);
  }

  try {
    const mint1mint2Pools = await gfxClient.api.fetchPoolByMints({ mint1: MINT1, mint2: MINT2 });
    console.log(`mint1mint2Pools: `, mint1mint2Pools);
  } catch (err) {
    console.log(`pool-by-mints2 req failed: ${err}`);
  }

  try {
    const poolKeys = await gfxClient.api.fetchPoolKeysById({ idList: [POOL_STATE] });
    console.log(`poolKeysById: `, poolKeys);
  } catch (err) {
    console.log(`pool-keys-by-id req failed: ${err}`);
  }

  try {
    const config = await gfxClient.api.getConfig(GAMMA_CONFIG);
    console.log(`config: `, config);
  } catch (err) {
    console.log(`get-config req failed: ${err}`);
  }

  try {
    const poolList = await gfxClient.api.getPoolList();
    console.log(`Got ${poolList.pools.length} pools from API`);
  } catch (err) {
    console.log(`get-pool-list req failed: ${err}`);
  }

  try {
    const tokenInfos = await gfxClient.api.getTokenInfo([MINT1, MINT2]);
    console.log(`tokenInfos: `, tokenInfos);
  } catch (err) {
    console.log(`get-token-info req failed: ${err}`);
  }

  try {
    const jupTokenList = await gfxClient.api.getJupTokenList();
    console.log(`Got ${jupTokenList.length} tokens from jup token list `);
  } catch (err) {
    console.log(`get-jup-token-list req failed: ${err}`);
  }
}

if (require.main === module) {
  mainFn().catch(console.error);
}
