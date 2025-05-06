import BN from "bn.js";

export const ZERO = new BN(0);

export function checkedRem(dividend: BN, divisor: BN): BN {
  if (divisor.isZero()) throw Error("divisor is zero");

  const result = dividend.mod(divisor);
  return result;
}

export function checkedCeilDiv(dividend: BN, rhs: BN): BN[] {
  if (rhs.isZero()) throw Error("rhs is zero");

  let quotient = dividend.div(rhs);

  if (quotient.isZero()) throw Error("quotient is zero");

  let remainder = checkedRem(dividend, rhs);

  if (remainder.gt(ZERO)) {
    quotient = quotient.add(new BN(1));

    rhs = dividend.div(quotient);
    remainder = checkedRem(dividend, quotient);
    if (remainder.gt(ZERO)) {
      rhs = rhs.add(new BN(1));
    }
  }
  return [quotient, rhs];
}

export function saturatingSub(a: BN, b: BN): BN {
  return a.gt(b) ? a.sub(b) : new BN(0);
}
