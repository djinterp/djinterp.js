/*******************************************************************************
* djinterp.js [tests]                                          real_read.test.js
*
*   The real reader's grammar: what C's strtod reads, less the hexadecimal
* form and "nan(...)", and how far into a text it reads. That every double
* reads back from its "%.17g" text is in real_format.test.js; that the
* option machine refuses what the reference refuses is in the transcripts.
*
*
* path:      /tests/text/real_read.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearest_double, read_real } from '../../src/text/real_read.js';

test('what is read, and how far', () =>
{
    const cases = [
        ['1',        1, 1],     ['-1',      2, -1],   ['+1',       2, 1],
        ['1.5',      3, 1.5],   ['.5',      2, 0.5],  ['5.',       2, 5],
        ['1e3',      3, 1000],  ['1E+3',    4, 1000], ['1e-3',     4, 0.001],
        ['1e',       1, 1],     ['1e+',     1, 1],    ['1ex',      1, 1],
        ['1.2.3',    3, 1.2],   ['1abc',    1, 1],    ['12 34',    2, 12],
        ['0x10',     1, 0],     ['1,5',     1, 1],    ['-.5e1x',   5, -5],
        ['',         0, 0],     ['.',       0, 0],    ['-',        0, 0],
        ['e5',       0, 0],     ['-.',      0, 0],    ['+-1',      0, 0],
        [' 1',       0, 0],     ['abc',     0, 0]
    ];

    for (const [text, length, value] of cases)
    {
        const read = read_real(text);

        assert.equal(read.length, length, JSON.stringify(text));
        assert.equal(read.value, value, JSON.stringify(text));
        assert.equal(read.overflow, false, JSON.stringify(text));
    }
});

test('JavaScript\'s readers would have read these otherwise', () =>
{
    // Number('') is 0; Number('0x10') is 16; parseFloat('1abc') is 1 with
    // no word of where it stopped
    assert.equal(read_real('').length, 0);
    assert.equal(read_real('0x10').length, 1);
    assert.equal(read_real('1abc').length, 1);
    assert.equal(read_real('Infinity').value, Infinity);
    assert.equal(read_real('infinity').value, Infinity);
});

test('the words, in any case, after a sign', () =>
{
    assert.deepEqual(read_real('inf'),
                     { length: 3, value: Infinity, overflow: false,
                       negative_nan: false });
    assert.equal(read_real('-INF').value, -Infinity);
    assert.equal(read_real('+Infinity').length, 9);
    assert.equal(read_real('infinit').length, 3);
    assert.ok(Number.isNaN(read_real('nan').value));
    assert.equal(read_real('NaN').negative_nan, false);
    assert.equal(read_real('-nan').negative_nan, true);
    assert.equal(read_real('nan(1)').length, 3);
});

test('zeros keep their sign', () =>
{
    assert.ok(Object.is(read_real('0').value, 0));
    assert.ok(Object.is(read_real('-0').value, -0));
    assert.ok(Object.is(read_real('-0.0e5').value, -0));
    assert.ok(Object.is(read_real('-1e-400').value, -0));
});

test('past the largest double is an overflow; under the smallest is not',
     () =>
{
    assert.deepEqual(read_real('1e309'),
                     { length: 5, value: Infinity, overflow: true,
                       negative_nan: false });
    assert.equal(read_real('-1e309').value, -Infinity);
    assert.equal(read_real('1.7976931348623157e308').overflow, false);
    assert.equal(read_real('1.7976931348623159e308').overflow, true);
    assert.equal(read_real('1e999999999999').overflow, true);
    assert.equal(read_real('1e-999999999999').value, 0);
    assert.equal(read_real('1e-400').overflow, false);
});

test('ties go to even, however many digits decide them', () =>
{
    // 2^53 + 1 lies half way between two doubles
    assert.equal(read_real('9007199254740993').value, 9007199254740992);
    assert.equal(read_real('9007199254740993.0000000000000000000000001')
                     .value, 9007199254740994);
    assert.equal(read_real('9007199254740995').value, 9007199254740996);

    // half the smallest double rounds to zero; a hair more, to it
    assert.equal(read_real('2.4703282292062327e-324').value, 0);
    assert.equal(read_real('2.4703282292062328e-324').value, 5e-324);

    // the largest double, and the first text that rounds past it
    assert.equal(nearest_double(17976931348623157n, 292).value,
                 Number.MAX_VALUE);
    assert.equal(nearest_double(0n, 5).value, 0);
});

test('a misuse throws', () =>
{
    assert.throws(() => read_real(1), TypeError);
    assert.throws(() => read_real(null), TypeError);
});
