/**
 * A finite double as sign, whole significand and power of two: the value is
 * (negative ? -1 : 1) * significand * 2^exponent, exactly.
 *
 * @param {number} _value  a finite double.
 * @returns {{negative: boolean, significand: bigint, exponent: number}}
 */
export function parts(_value: number): {
    negative: boolean;
    significand: bigint;
    exponent: number;
};
/**
 * A double as printf's "%.*g" writes it.
 *
 * The precision is the number of significant digits; 0 is taken as 1, as C
 * takes it. The exponent form is used where the exponent is under -4 or not
 * under the precision, and trailing zeros and a trailing point are dropped,
 * as "%g" without '#' drops them. An infinity is "inf" and a NaN "nan",
 * each after its sign.
 *
 * @param {number}  _value         the double.
 * @param {number}  _precision     the significant digits, 0 or more.
 * @returns {string} the text. Any NaN is "nan": JavaScript has one NaN
 *          and keeps no sign for it, where the reference's C library may
 *          write "-nan" (the owner's ruling 4 of 2026-11-16).
 */
export function formatG(_value: number, _precision: number): string;
/**
 * A real as the option machine writes one: "%.17g", which is enough digits
 * for any double to read back as itself.
 *
 * @param {number}  _value  the double.
 * @returns {string} the text.
 */
export function formatReal(_value: number): string;
