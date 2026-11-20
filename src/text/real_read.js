/*******************************************************************************
* djinterp.js [text]                                                real_read.js
*
*   A real from text, as C reads one: strtod, for the forms the reference
* lets reach it. JavaScript's own readers are not used: Number("") is 0,
* Number reads "0x10", and parseFloat reads the front of "1abc"
* (docs/JS_STYLE.md, section 5.4).
*   The value is exact: the nearest double to the decimal written, ties to
* even, found with whole-number arithmetic however many digits there are.
*   What is read: an optional sign; then "inf", "infinity" or "nan" in any
* case, or decimal digits with an optional point and an optional exponent.
* strtod also reads a hexadecimal real ("0x1p3") and "nan(...)"; the
* reference refuses both before strtod sees them, by their letters, so
* neither is read here, and a caller that needs them must add them.
*   reference: src/djinterp/c/option/option_env.c,
*              d_internal_option_env_read_real, at dfc793c4 -- which calls
*              strtod; the conversion itself is the C library's (ISO C,
*              7.22.1.3)
*
*
* path:      /src/text/real_read.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The nearest double
    1.  nearestDouble
2.  Reading
    1.  readReal
*/


//==============================================================================
// 1.  THE NEAREST DOUBLE
//==============================================================================

const SCRATCH = new DataView(new ArrayBuffer(8));

/**
 * The bits of a positive whole number.
 *
 * @param {bigint} _value  the number.
 * @returns {number}
 */
function bitLength(
    _value
)
{
    return _value.toString(2).length;
}

// 1.1
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
export function nearestDouble(
    _digits,
    _power
)
{
    if (_digits === 0n)
    {
        return { value: 0, overflow: false };
    }

    // past these no double is near: every digit could not bring it back
    const length = _digits.toString().length;

    if (_power + length > 310)
    {
        return { value: Infinity, overflow: true };
    }

    if (_power + length < -325)
    {
        return { value: 0, overflow: false };
    }

    // the value as a fraction of whole numbers
    const top    = (_power >= 0) ? (_digits * (10n ** BigInt(_power)))
                                 : _digits;
    const bottom = (_power >= 0) ? 1n : (10n ** BigInt(-_power));

    // the power of two that leaves a quotient of 53 bits: 2^52 <= q < 2^53
    let shift = 53 - (bitLength(top) - bitLength(bottom));
    let scaled;
    let quotient;

    for (;;)
    {
        scaled   = (shift >= 0) ? (top << BigInt(shift)) : top;
        quotient = scaled / ((shift >= 0) ? bottom
                                          : (bottom << BigInt(-shift)));

        if (quotient >= (1n << 53n))
        {
            --shift;
        }
        else if (quotient < (1n << 52n))
        {
            ++shift;
        }
        else
        {
            break;
        }
    }

    // a subnormal keeps fewer bits: the last bit is never under 2^-1074
    if (shift > 1074)
    {
        shift = 1074;
    }

    const divisor = (shift >= 0) ? bottom : (bottom << BigInt(-shift));

    scaled   = (shift >= 0) ? (top << BigInt(shift)) : top;
    quotient = scaled / divisor;

    const twice = (scaled - (quotient * divisor)) * 2n;

    if ( (twice > divisor) ||
         ( (twice === divisor) &&
           ((quotient & 1n) === 1n) ) )
    {
        ++quotient;
    }

    // quotient * 2^-shift, with quotient at most 2^53: exact in a double
    if (quotient === 0n)
    {
        return { value: 0, overflow: false };
    }

    let exponent = -shift;

    if (quotient === (1n << 53n))
    {
        quotient = 1n << 52n;
        ++exponent;
    }

    if (exponent + 52 > 1023)
    {
        return { value: Infinity, overflow: true };
    }

    // the bits, written directly: no arithmetic that could round again
    const normal = (quotient >= (1n << 52n));
    const biased = normal ? BigInt(exponent + 1075) : 0n;
    const bits   = (biased << 52n) | (quotient & ((1n << 52n) - 1n));

    SCRATCH.setBigUint64(0, bits);

    return { value: SCRATCH.getFloat64(0), overflow: false };
}


//==============================================================================
// 2.  READING
//==============================================================================

// 2.1
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
export function readReal(
    _text
)
{
    const none = { length: 0, value: 0, overflow: false };
    let   at   = 0;

    if (typeof _text !== 'string')
    {
        throw new TypeError('readReal: the text is not a string');
    }

    const negative = (_text[0] === '-');

    if ( negative ||
         (_text[0] === '+') )
    {
        ++at;
    }

    // a word: the longer one first
    const word = _text.slice(at, at + 8).toLowerCase();

    if (word === 'infinity')
    {
        return { length: at + 8, value: negative ? -Infinity : Infinity,
                 overflow: false };
    }

    if (word.startsWith('inf'))
    {
        return { length: at + 3, value: negative ? -Infinity : Infinity,
                 overflow: false };
    }

    if (word.startsWith('nan'))
    {
        return { length: at + 3, value: NaN, overflow: false };
    }

    // digits, a point, digits
    /** @type {function(number): boolean} */
    const isDigit = (_i) => ( (_text.charCodeAt(_i) >= 48) &&
                              (_text.charCodeAt(_i) <= 57) );
    let   digits   = '';
    let   power    = 0;

    while (isDigit(at))
    {
        digits += _text[at++];
    }

    if (_text[at] === '.')
    {
        let after = at + 1;

        while (isDigit(after))
        {
            digits += _text[after++];
            --power;
        }

        // a point with no digit either side is no number
        at = ( (digits.length !== 0) ||
               (after > at + 1) ) ? after : at;
    }

    if (digits.length === 0)
    {
        return none;
    }

    // an exponent, where it is whole: 'e', a sign or none, and a digit
    if ( (_text[at] === 'e') ||
         (_text[at] === 'E') )
    {
        let       after = at + 1;
        const     minus = (_text[after] === '-');
        let       value = 0;

        if ( minus ||
             (_text[after] === '+') )
        {
            ++after;
        }

        if (isDigit(after))
        {
            while (isDigit(after))
            {
                // past any double's reach the exact number does not matter
                value = Math.min((value * 10) + (_text.charCodeAt(after) - 48),
                                 100000);
                ++after;
            }

            power += minus ? -value : value;
            at     = after;
        }
    }

    const nearest = nearestDouble(BigInt(digits), power);

    return {
        length:       at,
        value:        negative ? -nearest.value : nearest.value,
        overflow:     nearest.overflow
    };
}
