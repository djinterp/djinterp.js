/*******************************************************************************
* djinterp.js [text]                                                     utf8.js
*
*   Bytes and JavaScript's strings. The reference's text is bytes: a
* statement's length, the offset a script's refusal is reported at, the 63
* bytes a name is measured to and an escape such as \xFF all count bytes,
* and a JavaScript string counts UTF-16 code units. The port therefore
* works on bytes and changes them for strings only where a caller hands
* text in or takes it out, here.
*   Bytes are held as a BYTE STRING: a string whose every code unit is one
* byte, 0 to 255. It indexes, slices and compares as the reference's
* `char*` does.
*   A byte that is not part of well-formed UTF-8 is kept, not replaced: it
* decodes to the lone surrogate U+DC00 + the byte (U+DC80 to U+DCFF), and
* that surrogate encodes to the byte again. Text the reference would write
* back unchanged is therefore written back unchanged by the port, whatever
* its bytes.
*   Nothing here has a counterpart in the reference, which never leaves
* bytes.
*
*
* path:      /src/text/utf8.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  Strings to bytes
    1.  encode
2.  Bytes to strings
    1.  decode
3.  Positions
    1.  byte_offset
    2.  string_index
*/


//==============================================================================
// 1.  STRINGS TO BYTES
//==============================================================================

// 1.1
/**
 * A string as UTF-8, in a byte string.
 *
 * A lone surrogate from U+DC80 to U+DCFF becomes the one byte it stands
 * for; any other lone surrogate becomes U+FFFD's three bytes.
 *
 * @param {string} _text  the string.
 * @returns {string} its bytes, one a code unit.
 */
export function encode(
    _text
)
{
    let out   = '';
    let start = 0;

    for (let i = 0; i < _text.length; ++i)
    {
        let code = _text.charCodeAt(i);

        if (code < 0x80)
        {
            continue;
        }

        out += _text.slice(start, i);

        if (code < 0x800)
        {
            out += String.fromCharCode(0xC0 | (code >> 6),
                                       0x80 | (code & 0x3F));
        }
        else if ( (code >= 0xD800) &&
                  (code <= 0xDBFF) &&
                  (i + 1 < _text.length) &&
                  (_text.charCodeAt(i + 1) >= 0xDC00) &&
                  (_text.charCodeAt(i + 1) <= 0xDFFF) )
        {
            // a pair: one code point past U+FFFF
            code = 0x10000 + ((code - 0xD800) << 10) +
                   (_text.charCodeAt(i + 1) - 0xDC00);
            ++i;
            out += String.fromCharCode(0xF0 | (code >> 18),
                                       0x80 | ((code >> 12) & 0x3F),
                                       0x80 | ((code >> 6) & 0x3F),
                                       0x80 | (code & 0x3F));
        }
        else if ( (code >= 0xDC80) &&
                  (code <= 0xDCFF) )
        {
            // a byte that was not UTF-8, kept
            out += String.fromCharCode(code - 0xDC00);
        }
        else
        {
            if ( (code >= 0xD800) &&
                 (code <= 0xDFFF) )
            {
                code = 0xFFFD;
            }

            out += String.fromCharCode(0xE0 | (code >> 12),
                                       0x80 | ((code >> 6) & 0x3F),
                                       0x80 | (code & 0x3F));
        }

        start = i + 1;
    }

    return (start === 0) ? _text : (out + _text.slice(start));
}


//==============================================================================
// 2.  BYTES TO STRINGS
//==============================================================================

/*
sequence_length
  The length of the well-formed UTF-8 sequence that starts at _at, 1 to 4;
0 where the bytes there are not one. Overlong forms, surrogates and code
points past U+10FFFF are not well formed.
*/
function sequence_length(
    _bytes,
    _at
)
{
    const lead = _bytes.charCodeAt(_at);
    const tail = (_k, _low, _high) =>
    {
        const c = (_at + _k < _bytes.length) ? _bytes.charCodeAt(_at + _k)
                                             : 0;

        return ( (c >= _low) &&
                 (c <= _high) );
    };

    if (lead < 0x80)
    {
        return 1;
    }

    if ( (lead >= 0xC2) &&
         (lead <= 0xDF) )
    {
        return tail(1, 0x80, 0xBF) ? 2 : 0;
    }

    if ( (lead >= 0xE0) &&
         (lead <= 0xEF) )
    {
        const low  = (lead === 0xE0) ? 0xA0 : 0x80;
        const high = (lead === 0xED) ? 0x9F : 0xBF;

        return ( tail(1, low, high) &&
                 tail(2, 0x80, 0xBF) ) ? 3 : 0;
    }

    if ( (lead >= 0xF0) &&
         (lead <= 0xF4) )
    {
        const low  = (lead === 0xF0) ? 0x90 : 0x80;
        const high = (lead === 0xF4) ? 0x8F : 0xBF;

        return ( tail(1, low, high)   &&
                 tail(2, 0x80, 0xBF)  &&
                 tail(3, 0x80, 0xBF) ) ? 4 : 0;
    }

    return 0;
}

// 2.1
/**
 * A byte string, read as UTF-8, as a string.
 *
 * A byte that is part of no well-formed sequence becomes the lone
 * surrogate U+DC00 + the byte, which `encode` turns back into it.
 *
 * @param {string} _bytes  the bytes, one a code unit.
 * @returns {string} the string.
 */
export function decode(
    _bytes
)
{
    let out   = '';
    let start = 0;

    for (let i = 0; i < _bytes.length; )
    {
        const lead = _bytes.charCodeAt(i);

        if (lead < 0x80)
        {
            ++i;

            continue;
        }

        const length = sequence_length(_bytes, i);

        out += _bytes.slice(start, i);

        if (length === 0)
        {
            out += String.fromCharCode(0xDC00 + lead);
            i   += 1;
        }
        else
        {
            let code = (length === 2) ? (lead & 0x1F)
                     : (length === 3) ? (lead & 0x0F)
                     : (lead & 0x07);

            for (let k = 1; k < length; ++k)
            {
                code = (code << 6) | (_bytes.charCodeAt(i + k) & 0x3F);
            }

            out += String.fromCodePoint(code);
            i   += length;
        }

        start = i;
    }

    return (start === 0) ? _bytes : (out + _bytes.slice(start));
}


//==============================================================================
// 3.  POSITIONS
//==============================================================================

// 3.1
/**
 * The offset in bytes of an index into a string: what the reference would
 * call the place `_index` code units into `_text`.
 *
 * @param {string} _text   the string.
 * @param {number} _index  an index into it, in code units.
 * @returns {number} the offset in its UTF-8.
 */
export function byte_offset(
    _text,
    _index
)
{
    return encode(_text.slice(0, _index)).length;
}

// 3.2
/**
 * The index into a string of an offset in bytes: where in `_text` the
 * reference's offset `_offset` falls. An offset inside a character's bytes
 * gives the index of that character.
 *
 * @param {string} _text    the string.
 * @param {number} _offset  an offset into its UTF-8.
 * @returns {number} the index, in code units.
 */
export function string_index(
    _text,
    _offset
)
{
    let bytes = 0;

    for (let i = 0; i < _text.length; )
    {
        const code  = _text.codePointAt(i);
        const units = (code > 0xFFFF) ? 2 : 1;
        const size  = encode(_text.slice(i, i + units)).length;

        if (bytes + size > _offset)
        {
            return i;
        }

        bytes += size;
        i     += units;
    }

    return _text.length;
}
