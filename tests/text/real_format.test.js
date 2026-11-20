/*******************************************************************************
* djinterp.js [tests]                                        real_format.test.js
*
*   The real writer against the reference: the table of docs/JS_STYLE.md,
* section 5.3, and the sweep tools/reals.c printed with the C library the
* reference calls -- every double's "%.17g", "%.15g", "%.6g" and "%.1g".
*   The same sweep is read back: each "%.17g" text must give the double it
* was written from, bit for bit.
*
*
* path:      /tests/text/real_format.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { format_g, format_real } from '../../src/text/real_format.js';
import { read_real } from '../../src/text/real_read.js';

const SWEEP = readFileSync(new URL('../../generated/reals.txt',
                                   import.meta.url), 'utf8')
                  .split('\n')
                  .filter((_line) => (_line.length !== 0))
                  .map((_line) => _line.split(' '));

/*
double_of
  The double whose bits are sixteen hexadecimal digits.
*/
function double_of(
    _hex
)
{
    const view = new DataView(new ArrayBuffer(8));

    view.setBigUint64(0, BigInt('0x' + _hex));

    return view.getFloat64(0);
}

/*
bits_of
  A double's bits, as sixteen hexadecimal digits.
*/
function bits_of(
    _value
)
{
    const view = new DataView(new ArrayBuffer(8));

    view.setFloat64(0, _value);

    return view.getBigUint64(0).toString(16).padStart(16, '0');
}

test('the table of JS_STYLE.md, section 5.3', () =>
{
    const table = [
        [0.1,     '0.10000000000000001'],
        [1.0 / 3, '0.33333333333333331'],
        [420.0,   '420'],
        [-0.0,    '-0'],
        [1e15,    '1000000000000000'],
        [1e21,    '1e+21'],
        [1.5e-7,  '1.4999999999999999e-07'],
        [2.5e-5,  '2.5000000000000001e-05'],
        [5e-324,  '4.9406564584124654e-324'],
        [-2.75,   '-2.75']
    ];

    for (const [value, text] of table)
    {
        assert.equal(format_real(value), text);
    }
});

test('what is not a finite number', () =>
{
    assert.equal(format_real(Infinity), 'inf');
    assert.equal(format_real(-Infinity), '-inf');
    assert.equal(format_real(NaN), 'nan');
    assert.equal(format_real(NaN, true), '-nan');
});

test('a precision of 0 is 1', () =>
{
    assert.equal(format_g(2.5, 0), '2');
    assert.equal(format_g(3.5, 0), '4');
    assert.equal(format_g(123456, 0), '1e+05');
});

test('a misuse throws', () =>
{
    assert.throws(() => format_g('1', 17), TypeError);
    assert.throws(() => format_g(1, -1), TypeError);
    assert.throws(() => format_g(1, 1.5), TypeError);
});

test('the sweep: "%.17g", "%.15g", "%.6g" and "%.1g" of every double', () =>
{
    assert.ok(SWEEP.length > 5000);

    for (const [hex, g17, g15, g6, g1] of SWEEP)
    {
        const value = double_of(hex);

        assert.equal(format_g(value, 17), g17, hex + ' at 17');
        assert.equal(format_g(value, 15), g15, hex + ' at 15');
        assert.equal(format_g(value, 6), g6, hex + ' at 6');
        assert.equal(format_g(value, 1), g1, hex + ' at 1');
    }
});

test('the sweep, read back: each "%.17g" text gives its double', () =>
{
    for (const [hex, g17] of SWEEP)
    {
        const read = read_real(g17);

        assert.equal(read.length, g17.length, g17);
        assert.equal(read.overflow, false, g17);
        assert.equal(bits_of(read.value), hex, g17);
    }
});
