import BN from "bn.js";
import { DynamicFee, FEE_RATE_DENOMINATOR_VALUE } from "./fee";
import { ConstantProductCurve } from "./constantProduct";
import { CpmmObservationState, CpmmPool } from "../type";
import { SwapResult, CurveCalculator } from "./calculator";
import { saturatingSub, checkedCeilDiv } from "./common";

// Price scaled to 9 decimal places
const D9 = new BN(Math.pow(10, 9));
const D9_SQUARED = D9.mul(D9);

export class OracleBasedCurveCalculator {
  static validate_supply(tokenAmount0: BN, tokenAmount1: BN): void {
    return CurveCalculator.validate_supply(tokenAmount0, tokenAmount1);
  }

  static swap(
    sourceAmount: BN,
    zeroForOne: boolean,
    baseReserve: BN,
    quoteReserve: BN,
    tradeFeeRate: BN,
    observationState: CpmmObservationState,
    poolState: CpmmPool,
    isInvokedWithSignedSegmenter = false,
  ): SwapResult {
    const swapSourceAmount = zeroForOne ? baseReserve : quoteReserve;
    const swapDestinationAmount = zeroForOne ? quoteReserve : baseReserve;

    const oraclePriceUpdatedAt = poolState.oraclePriceUpdatedAt;
    const blockTimestamp = new BN(new Date().getTime() / 1000);
    const timeDiff = saturatingSub(blockTimestamp, oraclePriceUpdatedAt);
    if (
      timeDiff.gtn(poolState.maxOraclePriceUpdateTimeDiff) ||
      blockTimestamp.lt(oraclePriceUpdatedAt) ||
      oraclePriceUpdatedAt.eqn(0) ||
      poolState.oraclePriceToken0ByToken1.eqn(0)
    ) {
      return CurveCalculator.swapBaseIn(
        sourceAmount,
        swapSourceAmount,
        swapDestinationAmount,
        tradeFeeRate,
        observationState,
        poolState.volatilityFactor,
        isInvokedWithSignedSegmenter,
      );
    }

    const spotPrice = swapDestinationAmount.mul(D9).div(swapSourceAmount);
    const oraclePrice = zeroForOne
      ? D9_SQUARED.div(poolState.oraclePriceToken0ByToken1)
      : poolState.oraclePriceToken0ByToken1;
    const rateDifference = OracleBasedCurveCalculator.getSpotPriceAndOraclePriceRateDifference(oraclePrice, spotPrice);
    if (rateDifference.gtn(poolState.acceptablePriceDifference)) {
      return CurveCalculator.swapBaseIn(
        sourceAmount,
        swapSourceAmount,
        swapDestinationAmount,
        tradeFeeRate,
        observationState,
        poolState.volatilityFactor,
        isInvokedWithSignedSegmenter,
      );
    }

    const amountToBeSwappedAtOraclePrice = OracleBasedCurveCalculator.getAmountToBeSwappedAtOraclePrice(
      sourceAmount,
      swapSourceAmount,
      swapDestinationAmount,
      oraclePrice,
      poolState,
    );
    const amountToBeSwappedWithInvariantCurve = sourceAmount.sub(amountToBeSwappedAtOraclePrice);

    if (amountToBeSwappedAtOraclePrice.eqn(0)) {
      return CurveCalculator.swapBaseIn(
        sourceAmount,
        swapSourceAmount,
        swapDestinationAmount,
        tradeFeeRate,
        observationState,
        poolState.volatilityFactor,
        isInvokedWithSignedSegmenter,
      );
    }

    const dynamicFeeRate = DynamicFee.calculateDynamicFeeRate(
      blockTimestamp,
      observationState,
      "volatility",
      tradeFeeRate,
      poolState.volatilityFactor,
      isInvokedWithSignedSegmenter,
    );

    const oracleSwapFeeRate = dynamicFeeRate.gten(poolState.minTradeRateAtOraclePrice)
      ? dynamicFeeRate
      : new BN(poolState.minTradeRateAtOraclePrice);
    const oracleSwapTradeFees = checkedCeilDiv(
      amountToBeSwappedAtOraclePrice.mul(oracleSwapFeeRate),
      FEE_RATE_DENOMINATOR_VALUE,
    )[0];
    const oracleSwapSourceAmountAfterFees = amountToBeSwappedAtOraclePrice.sub(oracleSwapTradeFees);
    const executionOraclePrice = OracleBasedCurveCalculator.getExecutionOraclePrice(
      oraclePrice,
      new BN(poolState.pricePremiumForSwapAtOraclePrice),
    );

    const outputTokensFromOracleSwap = executionOraclePrice.mul(oracleSwapSourceAmountAfterFees).div(D9);

    const newSwapSourceAmount = swapSourceAmount.add(amountToBeSwappedAtOraclePrice);
    const newSwapDestinationAmount = swapDestinationAmount.sub(outputTokensFromOracleSwap);

    const invariantSwapTradeFees = checkedCeilDiv(
      amountToBeSwappedWithInvariantCurve.mul(dynamicFeeRate),
      FEE_RATE_DENOMINATOR_VALUE,
    )[0];

    const sourceAmountAfterFees = saturatingSub(amountToBeSwappedWithInvariantCurve, invariantSwapTradeFees);
    let outputTokensFromInvariantSwap = new BN(0);
    if (!sourceAmountAfterFees.isZero()) {
      outputTokensFromInvariantSwap = ConstantProductCurve.swapWithoutFees(
        sourceAmountAfterFees,
        newSwapSourceAmount,
        newSwapDestinationAmount,
      ).destinationAmountSwapped;
    }

    const destinationAmountSwapped = outputTokensFromOracleSwap.add(outputTokensFromInvariantSwap);
    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: swapDestinationAmount.sub(destinationAmountSwapped),
      sourceAmountSwapped: sourceAmount,
      destinationAmountSwapped,
      tradeFee: invariantSwapTradeFees.add(oracleSwapTradeFees),
    };
  }

  private static getAmountToBeSwappedAtOraclePrice(
    sourceAmountToBeSwapped: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    oraclePrice: BN,
    poolState: CpmmPool,
  ): BN {
    const maxAmountSwappableAtOraclePrice = swapSourceAmount
      .muln(poolState.maxAmountSwappableAtOraclePrice)
      .div(FEE_RATE_DENOMINATOR_VALUE);
    const priceDifferenceLimit = FEE_RATE_DENOMINATOR_VALUE.subn(poolState.acceptablePriceDifference);
    const spotPriceAtAcceptablePriceDifferenceLimit = oraclePrice
      .mul(priceDifferenceLimit)
      .div(FEE_RATE_DENOMINATOR_VALUE);

    // To find Max tradeable amount with price Oracle Price P before we reach spot_price_at_acceptable_price_difference_limit Z:
    // x_delta_max = (|(Z*X) - Y)| / (Z + P)
    const numerator = spotPriceAtAcceptablePriceDifferenceLimit
      .mul(swapSourceAmount)
      .sub(swapDestinationAmount.mul(D9))
      .abs();
    const denominator = oraclePrice.add(spotPriceAtAcceptablePriceDifferenceLimit);
    const maxSwappableWithoutExceedingPriceDifference = numerator.div(denominator);

    const min = maxSwappableWithoutExceedingPriceDifference.gt(maxAmountSwappableAtOraclePrice)
      ? maxAmountSwappableAtOraclePrice
      : maxSwappableWithoutExceedingPriceDifference;
    return min.gt(sourceAmountToBeSwapped) ? sourceAmountToBeSwapped : min;
  }

  private static getSpotPriceAndOraclePriceRateDifference(oraclePrice: BN, spotPrice: BN): BN {
    return spotPrice.sub(oraclePrice).abs().mul(FEE_RATE_DENOMINATOR_VALUE).div(oraclePrice);
  }

  private static getExecutionOraclePrice(oraclePrice: BN, pricePremiumForOracleSwaps: BN): BN {
    const premium = oraclePrice.mul(pricePremiumForOracleSwaps).div(FEE_RATE_DENOMINATOR_VALUE);
    return oraclePrice.add(premium);
  }
}
