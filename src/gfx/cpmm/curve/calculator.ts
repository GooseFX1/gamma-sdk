import BN from "bn.js";
import { DynamicFee } from "./fee";
import { ConstantProductCurve } from "./constantProduct";
import { CpmmObservationState } from "../type";

export enum RoundDirection {
  Floor,
  Ceiling,
}

export type SwapWithoutFeesResult = { sourceAmountSwapped: BN; destinationAmountSwapped: BN };

export type TradingTokenResult = { tokenAmount0: BN; tokenAmount1: BN };

export type SwapResult = {
  newSwapSourceAmount: BN;
  newSwapDestinationAmount: BN;
  sourceAmountSwapped: BN;
  destinationAmountSwapped: BN;
  tradeFee: BN;
};

export class CurveCalculator {
  static validate_supply(tokenAmount0: BN, tokenAmount1: BN): void {
    if (tokenAmount0.isZero()) throw Error("tokenAmount0 is zero");
    if (tokenAmount1.isZero()) throw Error("tokenAmount1 is zero");
  }

  static swapBaseIn(
    sourceAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    tradeFeeRate: BN,
    observationState: CpmmObservationState,
    poolVolatilityFactor: BN,
    isInvokedWithSignedSegmenter = false,
  ): SwapResult {
    const tradeFee = DynamicFee.calculateDynamicFee(
      sourceAmount,
      new BN(new Date().getTime() / 1000),
      observationState,
      "volatility",
      tradeFeeRate,
      poolVolatilityFactor,
      isInvokedWithSignedSegmenter,
    );

    const sourceAmountLessFees = sourceAmount.sub(tradeFee);

    const { sourceAmountSwapped, destinationAmountSwapped } = ConstantProductCurve.swapWithoutFees(
      sourceAmountLessFees,
      swapSourceAmount,
      swapDestinationAmount,
    );

    const _sourceAmountSwapped = sourceAmountSwapped.add(tradeFee);
    return {
      newSwapSourceAmount: swapSourceAmount.add(_sourceAmountSwapped),
      newSwapDestinationAmount: swapDestinationAmount.sub(destinationAmountSwapped),
      sourceAmountSwapped: _sourceAmountSwapped,
      destinationAmountSwapped,
      tradeFee,
    };
  }

  static swapBaseOut(
    destinationAmount: BN,
    swapSourceAmount: BN,
    swapDestinationAmount: BN,
    tradeFeeRate: BN,
    observationState: CpmmObservationState,
    poolVolatilityFactor: BN,
    isInvokedWithSignedSegmenter = false,
  ): SwapResult {
    // Validate inputs
    if (destinationAmount.isZero()) throw new Error("destinationAmount is zero");
    if (destinationAmount.gt(swapDestinationAmount)) {
      throw new Error("destinationAmount exceeds available destination reserve");
    }

    // Calculate source amount without fees
    const { sourceAmountSwapped: sourceAmountLessFees, destinationAmountSwapped } =
      ConstantProductCurve.swapWithoutFeesBaseOut(destinationAmount, swapSourceAmount, swapDestinationAmount);

    const sourceAmount = DynamicFee.calculatePreDynamicFee(
      sourceAmountLessFees,
      new BN(new Date().getTime() / 1000),
      observationState,
      "volatility",
      tradeFeeRate,
      poolVolatilityFactor,
      isInvokedWithSignedSegmenter,
    );

    return {
      newSwapSourceAmount: swapSourceAmount.add(sourceAmount),
      newSwapDestinationAmount: swapDestinationAmount.sub(destinationAmountSwapped),
      sourceAmountSwapped: sourceAmount,
      destinationAmountSwapped,
      tradeFee: sourceAmount.sub(sourceAmountLessFees),
    };
  }
}
