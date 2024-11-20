import BN from "bn.js";
import { createLogger } from "./logger";

export enum Rounding {
  ROUND_DOWN,
  ROUND_HALF_UP,
  ROUND_UP,
}

export const BN_ZERO = new BN(0);
export const BN_ONE = new BN(1);
export const BN_TWO = new BN(2);
export const BN_THREE = new BN(3);
export const BN_FIVE = new BN(5);
export const BN_TEN = new BN(10);
export const BN_100 = new BN(100);
export const BN_1000 = new BN(1000);
export const BN_10000 = new BN(10000);
export type BigNumberish = BN | string | number | bigint;

const MAX_SAFE = 0x1fffffffffffff;

export function parseBigNumberish(value: BigNumberish): BN {
  const logger = createLogger("Gfx_parseBigNumberish");
  // BN
  if (value instanceof BN) {
    return value;
  }

  if (typeof value === "string") {
    if (value.match(/^-?[0-9]+$/)) {
      return new BN(value);
    }
    logger.logWithError(`invalid BigNumberish string: ${value}`);
  }

  if (typeof value === "number") {
    if (value % 1) {
      logger.logWithError(`BigNumberish number underflow: ${value}`);
    }

    if (value >= MAX_SAFE || value <= -MAX_SAFE) {
      logger.logWithError(`BigNumberish number overflow: ${value}`);
    }

    return new BN(String(value));
  }

  if (typeof value === "bigint") {
    return new BN(value.toString());
  }
  logger.error(`invalid BigNumberish value: ${value}`);
  return new BN(0); // never reach, because logWithError will throw error
}

export function tenExponential(shift: BigNumberish): BN {
  return BN_TEN.pow(parseBigNumberish(shift));
}