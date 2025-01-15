import BN from "bn.js";
import { DynamicFee } from "./fee";
import { ConstantProductCurve } from "./constantProduct";
import { PublicKey } from "@solana/web3.js";
import { BNDivCeil } from "@/common";
import Decimal from "decimal.js-light";
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

  static swap(
    sourceAmount: BN, 
    swapSourceAmount: BN, 
    swapDestinationAmount: BN, 
    tradeFeeRate: BN, 
    observationState: CpmmObservationState,
    _isInvokedWithSignedSegmenter = false,
  ): SwapResult {
    const tradeFee = DynamicFee.calculateDynamicFee(
      sourceAmount,
      new BN(new Date().getTime() / 1000),
      observationState,
      "volatility",
      tradeFeeRate,
      // TODO: make use of isInvokedWithSignedSegmenter for changing fee amount
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

  static swapBaseOut({
    poolMintA,
    poolMintB,
    tradeFeeRate,
    baseReserve,
    quoteReserve,
    outputMint,
    outputAmount,
  }: {
    poolMintA: {
      address: string,
      decimals: number,
    };
    poolMintB: {
      address: string
      decimals: number
    };
    tradeFeeRate: BN;
    baseReserve: BN;
    quoteReserve: BN;
    outputMint: string | PublicKey;
    outputAmount: BN;
  }): {
    amountRealOut: BN;

    amountIn: BN;
    amountInWithoutFee: BN;

    tradeFee: BN;
    priceImpact: number;
  } {
    const [reserveInAmount, reserveOutAmount, reserveInDecimals, reserveOutDecimals, inputMint] =
      poolMintB.address === outputMint.toString()
        ? [baseReserve, quoteReserve, poolMintA.decimals, poolMintB.decimals, poolMintA.address]
        : [quoteReserve, baseReserve, poolMintB.decimals, poolMintA.decimals, poolMintB.address];
    const currentPrice = new Decimal(reserveOutAmount.toString())
      .div(10 ** reserveOutDecimals)
      .div(new Decimal(reserveInAmount.toString()).div(10 ** reserveInDecimals));
    const amountRealOut = outputAmount.gte(reserveOutAmount) ? reserveOutAmount.sub(new BN(1)) : outputAmount;

    const denominator = reserveOutAmount.sub(amountRealOut);
    const amountInWithoutFee = BNDivCeil(reserveInAmount.mul(amountRealOut), denominator);
    const amountIn = BNDivCeil(amountInWithoutFee.mul(new BN(1_000_000)), new BN(1_000_000).sub(tradeFeeRate));
    const fee = amountIn.sub(amountInWithoutFee);
    const executionPrice = new Decimal(amountRealOut.toString())
      .div(10 ** reserveOutDecimals)
      .div(new Decimal(amountIn.toString()).div(10 ** reserveInDecimals));
    const priceImpact = currentPrice.isZero() ? 0 : executionPrice.sub(currentPrice).div(currentPrice).abs().toNumber();

    return {
      amountRealOut,

      amountIn,
      amountInWithoutFee,

      tradeFee: fee,
      priceImpact,
    };
  }
}
