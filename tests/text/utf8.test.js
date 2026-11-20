/*******************************************************************************
* djinterp.js [tests]                                               utf8.test.js
*
*   Bytes and strings: well-formed text both ways, and bytes that are not
* UTF-8 kept through a decode and an encode, which is what lets the port
* hand back the reference's bytes whatever they are.
*
*
* path:      /tests/text/utf8.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byte_offset, decode, encode, string_index }
    from '../../src/text/utf8.js';

const bytes = (_text) => Buffer.from(_text, 'utf8').toString('latin1');

test('well-formed text is UTF-8, as the platform encodes it', () =>
{
    for (const text of ['', 'plain', 'café', '€ 5', '日本',
                        '\u{1F600} and \u{10FFFF}', 'a\0b', '�',
                        '߿ࠀ￿'])
    {
        assert.equal(encode(text), bytes(text), text);
        assert.equal(decode(bytes(text)), text, text);
    }
});

test('the edges of each length, and of the surrogate pairs', () =>
{
    // the first and last code point of each UTF-8 length; then the pairs
    // whose high or low surrogate is the first or last there is
    for (const point of [0x7F, 0x80, 0x7FF, 0x800, 0xD7FF, 0xE000, 0xFFFF,
                         0x10000, 0x103FF, 0x10400, 0x10FC00, 0x10FFFF])
    {
        const text = String.fromCodePoint(point);

        assert.equal(encode(text), bytes(text), point.toString(16));
        assert.equal(decode(bytes(text)), text, point.toString(16));
    }
});

test('every byte string survives a decode and an encode', () =>
{
    // each single byte, then each pair with every lead
    for (let a = 0; a < 256; ++a)
    {
        const one = String.fromCharCode(a);

        assert.equal(encode(decode(one)), one, 'byte ' + a);

        for (let b = 0x70; b < 0x100; b += 3)
        {
            const two = one + String.fromCharCode(b);

            assert.equal(encode(decode(two)), two, 'bytes ' + a + ' ' + b);
        }
    }

    // overlong forms, surrogates, past U+10FFFF, and sequences cut short
    for (const raw of ['\xC0\x80', '\xC1\xBF', '\xE0\x80\x80', '\xE0\x9F\xBF',
                       '\xED\xA0\x80', '\xED\xBF\xBF', '\xF0\x80\x80\x80',
                       '\xF4\x90\x80\x80', '\xF5\x80\x80\x80', '\xE2\x82',
                       '\xF0\x9F\x98', 'a\xFFb', '\x80\x80\x80'])
    {
        assert.equal(encode(decode(raw)), raw);
    }
});

test('a byte that is not UTF-8 decodes to U+DC00 + the byte', () =>
{
    assert.equal(decode('a\xFFb'), 'a\uDCFFb');
    assert.equal(decode('\xC3'), '\uDCC3');
    assert.equal(decode('\xC3\xA9'), 'é');
    assert.equal(encode('\uDC80'), '\x80');
});

test('a lone surrogate that stands for no byte encodes as U+FFFD', () =>
{
    assert.equal(encode('\uD800'), bytes('�'));
    assert.equal(encode('\uDC00'), bytes('�'));
    assert.equal(encode('\uDFFF'), bytes('�'));
    assert.equal(encode('a\uD83Db'), 'a' + bytes('�') + 'b');
});

test('positions: an index into a string and an offset into its bytes', () =>
{
    const text = 'aé€\u{1F600}z';

    assert.deepEqual([0, 1, 2, 3, 5, 6].map((_i) => byte_offset(text, _i)),
                     [0, 1, 3, 6, 10, 11]);
    assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 10, 11, 99]
                         .map((_o) => string_index(text, _o)),
                     [0, 1, 1, 2, 2, 3, 3, 5, 6, 6]);
});
