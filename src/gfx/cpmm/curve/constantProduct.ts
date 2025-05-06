import BN from "bn.js";
import { RoundDirection, SwapWithoutFeesResult, TradingTokenResult } from "./calculator";
import { checkedCeilDiv, checkedRem, ZERO } from "./common";

export class ConstantProductCurve {
  static swapWithoutFees(sourceAmount: BN, swapSourceAmount: BN, swapDestinationAmount: BN): SwapWithoutFeesResult {
    const invariant = swapSourceAmount.mul(swapDestinationAmount);

    const newSwapSourceAmount = swapSourceAmount.add(sourceAmount);
    const [newSwapDestinationAmount, _newSwapSourceAmount] = checkedCeilDiv(invariant, newSwapSourceAmount);

    const sourceAmountSwapped = _newSwapSourceAmount.sub(swapSourceAmount);
    const destinationAmountSwapped = swapDestinationAmount.sub(newSwapDestinationAmount);
    if (destinationAmountSwapped.isZero()) throw Error("destinationAmountSwapped is zero");

    return {
      sourceAmountSwapped,
      destinationAmountSwapped,
    };
  }

  static lpTokensToTradingTokens(
    lpTokenAmount: BN,
    lpTokenSupply: BN,
    swapTokenAmount0: BN,
    swapTokenAmount1: BN,
    roundDirection: RoundDirection,
  ): TradingTokenResult {
    let tokenAmount0 = lpTokenAmount.mul(swapTokenAmount0).div(lpTokenSupply);
    let tokenAmount1 = lpTokenAmount.mul(swapTokenAmount1).div(lpTokenSupply);

    if (roundDirection === RoundDirection.Floor) {
      return { tokenAmount0, tokenAmount1 };
    } else if (roundDirection === RoundDirection.Ceiling) {
      const tokenRemainder0 = checkedRem(lpTokenAmount.mul(swapTokenAmount0), lpTokenSupply);

      if (tokenRemainder0.gt(ZERO) && tokenAmount0.gt(ZERO)) {
        tokenAmount0 = tokenAmount0.add(new BN(1));
      }

      const token1Remainder = checkedRem(lpTokenAmount.mul(swapTokenAmount1), lpTokenSupply);

      if (token1Remainder.gt(ZERO) && tokenAmount1.gt(ZERO)) {
        tokenAmount1 = tokenAmount1.add(new BN(1));
      }

      return { tokenAmount0, tokenAmount1 };
    }
    throw Error("roundDirection value error");
  }
}
