# Gamma SDK

**TypeScript SDK for GAMMA**  
Developer toolkit for integrating with GooseFX’s GAMMA AMM protocol on Solana.

---

## Overview

`Gamma-sdk` is a fully-typed, easy-to-use TypeScript SDK designed for building frontends, bots, and integration tools on top of the GAMMA decentralized exchange. It provides interfaces for all core operations — pool creation, swaps, add/removal of liquidity.

---

## Installation

```bash
yarn add goosefx-amm-sdk

# or
npm install goosefx-amm-sdk
```

---

## ⚙️ Features

- Manage liquidity pools: create, initialize, add/remove liquidity  
- Execute swaps
- Get quotes & estimate slippage and fees  
- Supports SPL Token2022, referral accounts, and fee-sharing

---

## Prerequisites

- Node.js >=12 and Yarn/NPM  
- A Solana connection (RPC endpoint & wallet)  
- Basic understanding of Solana, SPL Tokens, and AMM concepts

---

## ��️ Quickstart Example

```ts
import dotenv from "dotenv";
dotenv.config();
import { GfxCpmmClient } from "../src/gfx/index";
import fs from "fs";
import BN from "bn.js";

import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { OracleBasedCurveCalculator } from "@/gfx/cpmm/curve/oracleCalculator";
import { TxVersion } from "@/common";

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

  if (!info.rpcData.configInfo) throw new Error("configInfo not found");

  const swapResult = OracleBasedCurveCalculator.swap(
    AMOUNT,
    ZERO_FOR_ONE,
    info.rpcData.configInfo,
    info.rpcData.observationAccount,
    info.rpcData,
  );
  console.log(`swapResult: `, swapResult);

  const { transaction } = await client.cpmm.swapWithOracle({
    poolInfo: info.poolInfo,
    poolKeys: info.poolKeys,
    zeroForOne: ZERO_FOR_ONE,
    swapResult,
    slippage: SLIPPAGE_BPS / 10_000,
    computeBudgetConfig: {
      microLamports: MICRO_LAMPORTS,
    },
    txVersion: TxVersion.V0,
    wrapSol: true,
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
```

---

## Examples

See the full set of examples in the [`examples/`](./examples) directory:

- `oracle_swap.ts` – quote + swap execution  
- `liquidity.ts` – deposit/withdraw into a pool  
- `create.ts` – create pool

---

## Resources & Links

- GAMMA DEX protocol(can be used for anchor binding): [`gamma-swap`](https://github.com/GooseFX1/gamma-swap)  
- Swap HTTP API: [`gamma-swap-api`](https://github.com/GooseFX1/gamma-swap-api)  
- Official GAMMA dev docs: https://docs.goosefx.io  

---

## ��️ Security & Audits

- Refer to GAMMA audit at `gamma-swap/.audit/`

---

## Contributing

Contributions welcome!  
- File issues under `bug` or `enhancement`  
- Open PRs with unit tests & documentation updates  

---

## License

[MIT](./LICENSE)

---

### Get Involved

Follow GooseFX community channels for updates, support, and discussion: Discord, Telegram & GitHub Discussions.