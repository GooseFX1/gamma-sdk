import BN from "bn.js";
import { CpmmConfig, CpmmObservationState, CpmmPool, CpmmRpcData } from "../type";
import { SwapResult } from "./calculator";
import * as wasm from "gamma-wasm/gamma_wasm";

export class OracleBasedCurveCalculator {
  static swap(
    sourceAmount: BN,
    zeroForOne: boolean,
    ammConfig: CpmmConfig,
    observationState: CpmmObservationState,
    poolState: CpmmPool,
    isInvokedWithSignedSegmenter = false,
  ): SwapResult {
    wasm.solana_program_init();
    const quoteInput: wasm.QuoteInput = {
      sourceAmountToBeSwapped: sourceAmount.toNumber(),
      zeroForOne,
      poolStateData: poolState.raw.data,
      observationStateData: observationState.raw.data,
      ammConfigData: ammConfig.raw.data,
      isInvokedBySignedSegmenter: isInvokedWithSignedSegmenter,
    };

    const result = wasm.getOracleBasedSwapQuoteAmount(quoteInput);

    return {
      newSwapSourceAmount: new BN(result.newSwapSourceAmount),
      newSwapDestinationAmount: new BN(result.newSwapDestinationAmount),
      sourceAmountSwapped: new BN(result.sourceAmountSwapped),
      destinationAmountSwapped: new BN(result.destinationAmountSwapped),
      tradeFee: new BN(result.dynamicFee),
    };
  }
}
