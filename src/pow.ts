import { powInt } from "./roots.ts";
import { powT } from "./transcendental.ts";
import { PrecisionRequired, type Dec, type Precision } from "./decimal.ts";

/**
 * One name for both the exact and the approximate case. The type of the exponent
 * decides which one you get.
 *
 *   pow(x, 3)        integer exponent, exact, with no precision parameter
 *   pow(x, y, p)     decimal exponent, approximate, precision required
 */
export function pow(x: Dec, n: number): Dec;
export function pow(x: Dec, y: Dec, p: Precision): Dec;
export function pow(x: Dec, e: number | Dec, p?: Precision): Dec {
  if (typeof e === "number") return powInt(x, e);
  if (p === undefined)
    throw new PrecisionRequired("pow with a decimal exponent is approximate and needs a precision");
  return powT(x, e, p);
}
