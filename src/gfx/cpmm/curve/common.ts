import BN from "bn.js";

export const ZERO = new BN(0);

export function checkedRem(dividend: BN, divisor: BN): BN {
  if (divisor.isZero()) throw Error("divisor is zero");

  const result = dividend.mod(divisor);
  return result;
}

export function checkedCeilDiv(dividend: BN, rhs: BN): BN[] {
  if (rhs.isZero()) throw Error("rhs is zero");
  const quotient = dividend.div(rhs);
  if (quotient.isZero()) return [quotient, rhs];
  const remainder = dividend.sub(quotient.mul(rhs));
  if (remainder.isZero()) return [quotient, rhs];
  return [quotient.add(new BN(1)), rhs];
}

export function saturatingSub(a: BN, b: BN): BN {
  return a.gt(b) ? a.sub(b) : new BN(0);
}
