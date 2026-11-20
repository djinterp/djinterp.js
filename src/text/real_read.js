/*******************************************************************************
* djinterp.js [text]                                                real_read.js
*
*   A real from text, as C reads one: strtod, for the forms the reference
* lets reach it. JavaScript's own readers are not used: Number("") is 0,
* Number reads "0x10", and parseFloat reads the front of "1abc"
* (docs/style_guidelines_js.html, section 13).
*   The value is exact: the nearest double to the decimal written, ties to
* even, found with whole-number arithmetic however many digits there are.
*   What is read: an optional sign; then "inf", "infinity" or "nan" in any
* case, or decimal digits with an optional point and an optional exponent.
* strtod also reads a hexadecimal real ("0x1p3") and "nan(...)"; the
* reference refuses both before strtod sees them, by their letters, so
* neither is read here, and a caller that needs them must add them.
*   reference: src/djinterp/c/option/option_env.c,
*              d_internal_option_env_read_real, at 6fe35d43 -- which calls
*              strtod; the conversion itself is the C library's (ISO C,
*              7.22.1.3)
*
*
* path:      /src/text/real_read.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.20
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  THE NEAREST DOUBLE
    ------------------
    1.  nearestDouble
2.  READING
    -------
    1.  readReal
*/


//==============================================================================
// 1.  THE NEAREST DOUBLE
//==============================================================================

const SCRATCH = new DataView(new ArrayBuffer(8));

/**
 * bitLength
 *   The bits of a positive whole number.
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

/**
 * scaleOf
 *   The power of two a fraction is scaled by, `_top` / `_bottom` *
 * 2^shift, to leave a whole quotient of 53 bits, 2^52 <= q < 2^53; at most
 * 1074, since a subnormal keeps fewer bits and its last bit is never under
 * 2^-1074.
 *
 * @param {bigint} _top     the fraction's top, more than 0.
 * @param {bigint} _bottom  its bottom, more than 0.
 * @returns {number} the shift.
 */
function scaleOf(
    _top,
    _bottom
)
{
    let shift = 53 - (bitLength(_top) - bitLength(_bottom));

    for (;;)
    {
        const quotient = ((shift >= 0) ? (_top << BigInt(shift)) : _top) /
                         ((shift >= 0) ? _bottom
                                       : (_bottom << BigInt(-shift)));

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

    return Math.min(shift, 1074);
}

/**
 * doubleOf
 *   The double `_whole` * 2^`_exponent`, for a whole number at most 2^53
 * that is the rounded quotient of a scaling: exact, since its bits are
 * written directly, with no arithmetic that could round again.
 *
 * @param {bigint} _whole     the whole number, 0 to 2^53.
 * @param {number} _exponent  the power of two.
 * @returns {{value: number, overflow: boolean}} as `nearestDouble` gives.
 */
function doubleOf(
    _whole,
    _exponent
)
{
    let whole    = _whole;
    let exponent = _exponent;

    if (whole === 0n)
    {
        return { value: 0, overflow: false };
    }

    // a carry out of 53 bits
    if (whole === (1n << 53n))
    {
        whole = 1n << 52n;
        ++exponent;
    }

    if (exponent + 52 > 1023)
    {
        return { value: Infinity, overflow: true };
    }

    const normal = (whole >= (1n << 52n));
    const biased = normal ? BigInt(exponent + 1075) : 0n;

    SCRATCH.setBigUint64(0, (biased << 52n) | (whole & ((1n << 52n) - 1n)));

    return { value: SCRATCH.getFloat64(0), overflow: false };
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
    const top     = (_power >= 0) ? (_digits * (10n ** BigInt(_power)))
                                  : _digits;
    const bottom  = (_power >= 0) ? 1n : (10n ** BigInt(-_power));
    const shift   = scaleOf(top, bottom);
    const divisor = (shift >= 0) ? bottom : (bottom << BigInt(-shift));
    const scaled  = (shift >= 0) ? (top << BigInt(shift)) : top;
    let   whole   = scaled / divisor;

    // to nearest, ties to even
    const twice = (scaled - (whole * divisor)) * 2n;

    if ( (twice > divisor) ||
         ( (twice === divisor) &&
           ((whole & 1n) === 1n) ) )
    {
        ++whole;
    }

    return doubleOf(whole, -shift);
}


//==============================================================================
// 2.  READING
//==============================================================================

/**
 * isDigitAt
 *   Whether a text has a decimal digit at an offset.
 *
 * @param {string} _text  the text.
 * @param {number} _at    the offset; past the end is no digit.
 * @returns {boolean}
 */
function isDigitAt(
    _text,
    _at
)
{
    return ( (_text.charCodeAt(_at) >= 48) &&
             (_text.charCodeAt(_at) <= 57) );
}

/**
 * wordOf
 *   A real written as a word, at an offset after any sign: "infinity",
 * "inf" or "nan", in any case, the longer one first.
 *
 * @param {string}  _text      the text.
 * @param {number}  _at        where the word would start.
 * @param {boolean} _negative  whether a '-' came before it.
 * @returns {?{length: number, value: number, overflow: boolean}} as
 *          `readReal` gives; null where no word is there.
 */
function wordOf(
    _text,
    _at,
    _negative
)
{
    const word = _text.slice(_at, _at + 8).toLowerCase();

    if (word === 'infinity')
    {
        return { length: _at + 8, value: _negative ? -Infinity : Infinity,
                 overflow: false };
    }

    if (word.startsWith('inf'))
    {
        return { length: _at + 3, value: _negative ? -Infinity : Infinity,
                 overflow: false };
    }

    if (word.startsWith('nan'))
    {
        return { length: _at + 3, value: NaN, overflow: false };
    }

    return null;
}

/**
 * exponentOf
 *   An exponent at an offset, where it is whole: 'e' or 'E', a sign or
 * none, and at least one digit. Where it is not whole, none is read.
 *
 * @param {string} _text  the text.
 * @param {number} _at    where the 'e' would be.
 * @returns {{power: number, end: number}} the power of ten, 0 where none
 *          was read, and where the reading ends.
 */
function exponentOf(
    _text,
    _at
)
{
    if ( (_text[_at] !== 'e') &&
         (_text[_at] !== 'E') )
    {
        return { power: 0, end: _at };
    }

    let       after = _at + 1;
    const     minus = (_text[after] === '-');
    let       value = 0;

    if ( minus ||
         (_text[after] === '+') )
    {
        ++after;
    }

    if (!isDigitAt(_text, after))
    {
        return { power: 0, end: _at };
    }

    while (isDigitAt(_text, after))
    {
        // past any double's reach the exact number does not matter
        value = Math.min((value * 10) + (_text.charCodeAt(after) - 48),
                         100000);
        ++after;
    }

    return { power: minus ? -value : value, end: after };
}

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

    const word = wordOf(_text, at, negative);

    if (word !== null)
    {
        return word;
    }

    // digits, a point, digits
    let digits = '';
    let power  = 0;

    while (isDigitAt(_text, at))
    {
        digits += _text[at++];
    }

    if (_text[at] === '.')
    {
        let after = at + 1;

        while (isDigitAt(_text, after))
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

    const exponent = exponentOf(_text, at);
    const nearest  = nearestDouble(BigInt(digits), power + exponent.power);

    return {
        length:       exponent.end,
        value:        negative ? -nearest.value : nearest.value,
        overflow:     nearest.overflow
    };
}
