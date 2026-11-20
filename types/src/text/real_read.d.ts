/**
 * The double nearest to a whole number of digits times a power of ten:
 * `_digits` * 10^`_power`, rounded to nearest with ties to even.
 *
 * @param {bigint} _digits  the digits as a whole number, 0 or more.
 * @param {number} _power   the power of ten.
 * @returns {{value: number, overflow: boolean}} the double; `overflow`
 *          where the value is past the largest double, and `value` is then
 *          Infinity. A value under the smallest double is 0, or the
 *          smallest, as it rounds, and is not an overflow.
 */
export function nearestDouble(_digits: bigint, _power: number): {
    value: number;
    overflow: boolean;
};
/**
 * A real from the front of a text, as strtod reads one.
 *
 * Reads the longest prefix that is a real: an optional '+' or '-'; then
 * "infinity", "inf" or "nan" in any case, or digits with at most one point
 * and at least one digit, and then an 'e' or 'E', an optional sign and
 * digits where all three are there. No leading space is skipped: the
 * reference trims a value before it reads one.
 *
 * @param {string} _text  the text; each code unit is read as one character,
 *        so a byte string and a string of ASCII read alike.
 * @returns {{length: number, value: number, overflow: boolean}}
 *          `length` is how much was read, 0 where the text does not start
 *          with a real. `overflow` is strtod's ERANGE with HUGE_VAL: the
 *          value is past the largest double, and `value` is an infinity.
 *          "nan" and "-nan" both read as NaN: no sign is kept for one.
 */
export function readReal(_text: string): {
    length: number;
    value: number;
    overflow: boolean;
};
