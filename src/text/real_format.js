/*******************************************************************************
* djinterp.js [text]                                              real_format.js
*
*   A real as text, as C writes one: printf's "%.*g" for a double, digit
* for digit. JavaScript's own writers -- String, toFixed, toPrecision --
* agree with it for few values (docs/JS_STYLE.md, section 5.3), so none of
* them is used.
*   The digits are exact. A double is an integer times a power of two, and
* so has a finite decimal expansion; this file writes that expansion out
* with whole-number arithmetic, rounds it once to the precision asked for,
* to nearest with ties to even, and lays it out as "%g" does. That is what
* the C library the reference was measured with does, so the two agree on
* every double and not only on those a shorter method happens to get right.
*   reference: src/djinterp/c/option/option_env.c,
*              d_internal_option_env_format_real, at 3eb096c9 -- which
*              calls snprintf("%.17g"); the conversion itself is the C
*              library's (ISO C, 7.21.6.1, the g conversion)
*
*
* path:      /src/text/real_format.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.17
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  A DOUBLE'S PARTS
    ----------------
    1.  parts
2.  WRITING
    -------
    1.  formatG
    2.  formatReal
*/


//==============================================================================
// 1.  A DOUBLE'S PARTS
//==============================================================================

const SCRATCH = new DataView(new ArrayBuffer(8));

// 1.1
/**
 * A finite double as sign, whole significand and power of two: the value is
 * (negative ? -1 : 1) * significand * 2^exponent, exactly.
 *
 * @param {number} _value  a finite double.
 * @returns {{negative: boolean, significand: bigint, exponent: number}}
 */
export function parts(
    _value
)
{
    SCRATCH.setFloat64(0, _value);

    const high     = SCRATCH.getUint32(0);
    const low      = SCRATCH.getUint32(4);
    const biased   = (high >>> 20) & 0x7FF;
    const fraction = (BigInt(high & 0xFFFFF) << 32n) | BigInt(low);

    // a subnormal has no hidden bit, and the smallest exponent
    return {
        negative:    ((high >>> 31) !== 0),
        significand: (biased === 0) ? fraction : (fraction | (1n << 52n)),
        exponent:    ((biased === 0) ? 1 : biased) - 1075
    };
}


//==============================================================================
// 2.  WRITING
//==============================================================================

/**
 * digitsOf
 *   The decimal digits of a finite double's magnitude, rounded to
 * `_precision` significant digits, to nearest with ties to even, and the
 * power of ten of the first: the value is d.ddd * 10^exponent. Zero is "0"
 * at exponent 0.
 *
 * @param {number} _value      the double, finite.
 * @param {number} _precision  the significant digits, 1 or more.
 * @returns {{digits: string, exponent: number}}
 */
function digitsOf(
    _value,
    _precision
)
{
    const { significand, exponent } = parts(_value);

    if (significand === 0n)
    {
        return { digits: '0'.repeat(_precision), exponent: 0 };
    }

    // the exact expansion: every digit, and the power of ten of the last
    const whole = (exponent >= 0) ? (significand << BigInt(exponent))
                                  : (significand * (5n ** BigInt(-exponent)));
    const last  = (exponent >= 0) ? 0 : exponent;
    let   text  = whole.toString();
    let   first = text.length - 1 + last;

    if (text.length <= _precision)
    {
        return { digits: text + '0'.repeat(_precision - text.length),
                 exponent: first };
    }

    // what is cut off against a half: the first cut digit, then the rest
    const cut  = text.charCodeAt(_precision) - 48;
    const rest = /[1-9]/.test(text.slice(_precision + 1));
    const odd  = ((text.charCodeAt(_precision - 1) - 48) % 2) === 1;

    text = text.slice(0, _precision);

    if ( (cut > 5) ||
         ( (cut === 5) &&
           ( rest || odd ) ) )
    {
        text = (BigInt(text) + 1n).toString();

        // a carry out of the top: 9.99 became 10.0
        if (text.length > _precision)
        {
            text = text.slice(0, _precision);
            ++first;
        }
    }

    return { digits: text, exponent: first };
}

// 2.1
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
export function formatG(
    _value,
    _precision
)
{
    if (typeof _value !== 'number')
    {
        throw new TypeError('formatG: the value is not a number');
    }

    if (!Number.isInteger(_precision) ||
        (_precision < 0))
    {
        throw new TypeError('formatG: the precision is not a count');
    }

    if (Number.isNaN(_value))
    {
        return 'nan';
    }

    const negative = ( (_value < 0) ||
                       Object.is(_value, -0) );
    const sign     = negative ? '-' : '';

    if (!Number.isFinite(_value))
    {
        return sign + 'inf';
    }

    const precision            = (_precision === 0) ? 1 : _precision;
    const { digits, exponent } = digitsOf(_value, precision);

    if ( (exponent < -4) ||
         (exponent >= precision) )
    {
        // d.ddde+XX: the fraction's trailing zeros go, then a bare point
        const fraction = digits.slice(1).replace(/0+$/, '');
        const power    = Math.abs(exponent);

        return sign + digits[0] +
               ((fraction.length !== 0) ? ('.' + fraction) : '') + 'e' +
               ((exponent < 0) ? '-' : '+') +
               ((power < 10) ? '0' : '') + power;
    }

    if (exponent < 0)
    {
        // 0.000ddd
        return sign + '0.' + '0'.repeat(-exponent - 1) +
               digits.replace(/0+$/, '');
    }

    const whole    = digits.slice(0, exponent + 1);
    const fraction = digits.slice(exponent + 1).replace(/0+$/, '');

    return sign + whole + ((fraction.length !== 0) ? ('.' + fraction) : '');
}

// 2.2
/**
 * A real as the option machine writes one: "%.17g", which is enough digits
 * for any double to read back as itself.
 *
 * @param {number}  _value  the double.
 * @returns {string} the text.
 */
export function formatReal(
    _value
)
{
    return formatG(_value, 17);
}
