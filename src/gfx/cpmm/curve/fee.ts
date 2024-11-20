import BN from "bn.js";
import { CpmmObservationState, CpmmObservation } from "../type";
import Decimal from "decimal.js-light";

export const FEE_RATE_DENOMINATOR_VALUE = new BN(1_000_000);
const OBSERVATION_LEN = 100;
// Volatility-based fee constants
// const MAX_FEE_VOLATILITY = new BN(10000); // 1% max fee
const VOLATILITY_WINDOW = new BN(3600); // 1 hour window for volatility calculation

const MAX_FEE = new BN(100000); // 10% max fee
const VOLATILITY_FACTOR = new BN(300000); // Adjust based on desired sensitivity

type PriceRange = {
  minPrice: BN;
  maxPrice: BN;
  twapPrice: BN;
}

type FeeType = 'volatility'

export class DynamicFee {
  static calculateDynamicFee(
    amount: BN,
    blockTimestamp: BN,
    observationState: CpmmObservationState,
    feeType: FeeType,
    baseFees: BN
  ): BN {
    let feeRate = this.calculateDynamicFeeRate(
      blockTimestamp,
      observationState,
      feeType,
      baseFees
    )

    return (amount.mul(feeRate).add(FEE_RATE_DENOMINATOR_VALUE).subn(1)).div(FEE_RATE_DENOMINATOR_VALUE)
  }

  static calculateDynamicFeeRate(
    blockTimestamp: BN,
    observationState: CpmmObservationState,
    feeType: FeeType,
    baseFees: BN
  ): BN {
    switch(feeType) {
      case 'volatility': {
        return this.calculateVolatileFee(blockTimestamp, observationState, baseFees)
      }
    }
  }

  static calculateVolatileFee(
    blockTimestamp: BN,
    observationState: CpmmObservationState,
    baseFees: BN
  ): BN {
    const { minPrice, maxPrice, twapPrice } = this.getPriceRange(observationState, blockTimestamp, VOLATILITY_WINDOW)
    if (minPrice.eqn(0) || maxPrice.eqn(0) || twapPrice.eqn(0) || twapPrice.eqn(1)) {
      return baseFees
    }

    const logMaxPrice = new Decimal(maxPrice.toString()).ln()
    const logMinPrice = new Decimal(minPrice.toString()).ln()
    const logTwapPrice = new Decimal(twapPrice.toString()).ln()

    const numerator = logMaxPrice.sub(logMinPrice)
    const denominator = logTwapPrice.abs()

    if (denominator.eq(0)) {
      return baseFees
    }

    const volatility = numerator.div(denominator)
    const volatilityComponent = new Decimal(VOLATILITY_FACTOR.toString()).mul(volatility)

    const dynamicFee = new Decimal(baseFees.toString()).add(volatilityComponent)
    return new BN(dynamicFee.lessThan(new Decimal(MAX_FEE.toString())) ? dynamicFee.toString() : MAX_FEE.toString())
  }

  static getPriceRange(
    observationState: CpmmObservationState,
    currentTime: BN,
    window: BN
  ): PriceRange {
    let minPrice = new BN(1).ushln(128).subn(1)
    let maxPrice = new BN(0)

    let descendingObservations = observationState.observations
      .map((observation, idx) => ({observation, idx}))
      .filter(({ observation }) => {
        observation.blockTimestamp.eqn(0) 
          && !observation.cumulativeToken0PriceX32.eqn(0)
          && !observation.cumulativeToken1PriceX32.eqn(0)
          && currentTime.sub(observation.blockTimestamp) <= window
      })
      .map(({observation, idx}) => {
        return {
          index: idx,
          observation
        }
      })

    if (descendingObservations.length < 2) {
      return {
        minPrice: new BN(0),
        maxPrice: new BN(0),
        twapPrice: new BN(0),
      }
    }

    descendingObservations.sort((a, b) => b.observation.blockTimestamp.cmp(a.observation.blockTimestamp))

    const newestObs = descendingObservations[0]
    const oldestObs = descendingObservations[descendingObservations.length - 1]

    const totalTimeDelta = saturatingSub(newestObs.observation.blockTimestamp, oldestObs.observation.blockTimestamp)
    if (totalTimeDelta.eqn(0)) {
      return {
        minPrice: new BN(0),
        maxPrice: new BN(0),
        twapPrice: new BN(0),
      }
    }

    const twapPrice = newestObs.observation.cumulativeToken0PriceX32
      .sub(oldestObs.observation.cumulativeToken0PriceX32)
      .div(totalTimeDelta)

    for (const indexedObservation of descendingObservations) {
      let lastObservation: CpmmObservation
      if (indexedObservation.index == 0) {
        lastObservation = observationState.observations[OBSERVATION_LEN - 1]
      } else {
        lastObservation = observationState.observations[indexedObservation.index - 1]
      }

      if (lastObservation.blockTimestamp.eqn(0)) {
        continue
      }

      if (lastObservation.blockTimestamp > indexedObservation.observation.blockTimestamp) {
        break
      }

      const nextObservation = indexedObservation.observation
      const timeDelta = saturatingSub(nextObservation.blockTimestamp, lastObservation.blockTimestamp)

      if (timeDelta.eqn(0)) {
        continue
      }

      const price = (nextObservation.cumulativeToken0PriceX32.sub(lastObservation.cumulativeToken0PriceX32)).div(timeDelta)

      minPrice = BN.min(minPrice, price)
      maxPrice = BN.max(maxPrice, price)
    }

    return {
      minPrice,
      maxPrice,
      twapPrice
    }
  }

  static calculatePreFeeAmount(
    blockTimestamp: BN,
    postFeeAmount: BN,
    observationState: CpmmObservationState,
    feeType: FeeType,
    baseFees: BN
  ): BN {
    const dynamicFeeRate = this.calculateDynamicFeeRate(blockTimestamp, observationState, feeType, baseFees)
    if (dynamicFeeRate.eqn(0)) {
      return postFeeAmount
    } else {
      const numerator = postFeeAmount.mul(FEE_RATE_DENOMINATOR_VALUE)
      const denominator = FEE_RATE_DENOMINATOR_VALUE.sub(dynamicFeeRate)

      return (numerator.add(denominator).subn(1)).div(denominator)
    }
  }
}

function saturatingSub(a: BN, b: BN): BN {
  return a > b ? a.sub(b) : new BN(0)
}
