// @ts-nocheck

import KaminoIDL from '../idl/kamino_lending.json'
import { AccountMeta, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { Idl, Program, Provider } from '@coral-xyz/anchor'
import { struct } from '@/marshmallow'

const KAMINO_PROGRAM_ID = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD'
const KAMINO_MARKET_ID = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'

/**
 * Lending market authority seed
 */
export const LENDING_MARKET_AUTH_SEED = 'lma'

export function getLendingMarketAuthority(lendingMarket: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(LENDING_MARKET_AUTH_SEED), lendingMarket.toBuffer()],
    programId
  )
}

export function getGammaPoolDestinationCollateral(poolAddress: PublicKey, tokenMint: PublicKey, gammaId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool_kamino_deposits'), poolAddress.toBuffer(), tokenMint.toBuffer()],
    gammaId
  )[0]
}

export interface KaminoReserve {
  address: PublicKey
  state: KaminoReserveAccount
}
interface KaminoReserveAccount {
  version: BN
  lendingMarket: PublicKey
  farmCollateral: PublicKey
  farmDebt: PublicKey
  liquidity: ReserveLiquidity
  collateral: ReserveCollateral
  /** incomplete field definitions */
}

interface ReserveLiquidity {
  mintPubkey: PublicKey
  supplyVault: PublicKey
  feeVault: PublicKey
  /** incomplete field definitions */
}

interface ReserveCollateral {
  mintPubkey: PublicKey
  supplyVault: PublicKey
  /** incomplete field definitions */
}

export async function getReservesForMarket(
  provider: Provider,
  marketAddress?: PublicKey,
  kaminoProgram?: PublicKey,
): Promise<Map<string, KaminoReserve>> {
  const idl = {
    ...KaminoIDL,
    address: kaminoProgram?.toBase58() ?? KAMINO_PROGRAM_ID
  }
  const kamino = new Program(KaminoIDL as unknown as Idl, provider)
  // @ts-ignore
  const reserves = await kamino.account.reserve.all([
    {
      memcmp: {
        offset: 32,
        bytes: marketAddress?.toBase58() ?? KAMINO_MARKET_ID
      }
    }
  ])
  const reservesByLiquidity = new Map<string, KaminoReserve>()

  reserves.forEach((reserve) => {
    const reserveLiquidity = reserve.account.liquidity as unknown as ReserveLiquidity
    reservesByLiquidity.set(reserveLiquidity.mintPubkey.toBase58(), {
      address: reserve.publicKey,
      state: {
        version: reserve.account.version as unknown as BN,
        lendingMarket: reserve.account.lendingMarket as unknown as PublicKey,
        farmCollateral: reserve.account.farmCollateral as unknown as PublicKey,
        farmDebt: reserve.account.farmDebt as unknown as PublicKey,
        liquidity: reserveLiquidity,
        collateral: reserve.account.collateral as unknown as ReserveCollateral
      }
    })
  })
  return reservesByLiquidity
}

export function getReserveAccountsForWithdraw(
  pool: PublicKey,
  reserveA: KaminoReserve | undefined, 
  reserveB: KaminoReserve | undefined,
  maxSharedTokenA: BN,
  maxSharedTokenB: BN,
  gammaProgram: PublicKey,
  kaminoProgram?: PublicKey
): AccountMeta[] {
  const programIds = new Array<PublicKey>(6).fill(gammaProgram).map((pubkey) => {
    return { pubkey, isWritable: false, isSigner: false }
  })
  const accounts = new Array()

  if (maxSharedTokenA.gtn(0) && reserveA) {
    accounts.push(...getAccountsForReserve(pool, reserveA, gammaProgram, kaminoProgram))
  } else {
    accounts.push(...programIds)
  }

  if (maxSharedTokenB.gtn(0) && reserveB) {
    accounts.push(...getAccountsForReserve(pool, reserveB, gammaProgram, kaminoProgram))
  } else {
    accounts.push(...programIds)
  }
  
  return accounts
}

function getAccountsForReserve(
  pool: PublicKey,
  reserve: KaminoReserve,
  gammaProgram: PublicKey,
  kaminoProgram?: PublicKey
): AccountMeta[] {
  const lendingMarketAuthority = getLendingMarketAuthority(
    reserve.state.lendingMarket, kaminoProgram ?? new PublicKey(KAMINO_PROGRAM_ID))[0]
  const gammaDestination = getGammaPoolDestinationCollateral(
    pool, 
    reserve.state.liquidity.mintPubkey,
    gammaProgram
  )
  return [
    { pubkey: reserve.address, isWritable: true, isSigner: true },
    { pubkey: reserve.state.lendingMarket, isWritable: true, isSigner: true },
    { pubkey: lendingMarketAuthority, isWritable: false, isSigner: true },
    { pubkey: reserve.state.liquidity.supplyVault, isWritable: true, isSigner: true },
    { pubkey: reserve.state.collateral.mintPubkey, isWritable: true, isSigner: true},
    { pubkey: gammaDestination, isWritable: false, isSigner: true }
  ]
}