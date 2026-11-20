/*******************************************************************************
* djinterp.js [event]                                            event_common.js
*
*   The event core's vocabulary: a key, which names an event; a verdict,
* which a handler gives -- pass, or consume, which cuts off the handlers
* after it; and the statuses of the table's and the queue's operations.
*   A key is 64 bits, held as a bigint. One is made from an event's name by
* FNV-1a-64 over the name's bytes, as the reference makes it, so that a
* key made here is the key the reference makes of the same name.
*   The statuses and constants are not typed here: generated/event.js holds
* what tools/rows_json.c read from the reference.
*   reference: inc/djinterp/c/event/event_common.h, at dfc793c4
*
*
* path:      /src/event/event_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  Keys and ids
    1.  KEY_NONE, HANDLER_ID_NULL
    2.  key_of_name
2.  Verdicts
    1.  VERDICT
    2.  verdict_is_consumed
3.  Statuses
    1.  STATUS
*/

import data from '../../generated/event.js';

const strip = (_name, _prefix) => _name.slice(_prefix.length);


//==============================================================================
// 1.  KEYS AND IDS
//==============================================================================

// 1.1
/** The key that names no event. `key_of_name` never gives it. */
export const KEY_NONE = BigInt(data.key_none);

/**
 * The handler id that names no handler. An id is a count of bindings from
 * 1, held as a number: the reference holds it in 64 bits, and a table
 * would have to bind 2^53 handlers for a number to fail it.
 */
export const HANDLER_ID_NULL = Number(data.handler_id_null);

const FNV_OFFSET = BigInt(data.fnv1a64_offset);
const FNV_PRIME  = BigInt(data.fnv1a64_prime);

// 1.2
/**
 * The key of an event's name: FNV-1a-64 over the name's bytes in UTF-8, up
 * to a NUL. A name that hashes to 0 is given 1, so that KEY_NONE stays
 * reserved.
 *
 * @param {?string} _name  the event's name.
 * @returns {bigint} the key; KEY_NONE for no name.
 */
export function key_of_name(
    _name
)
{
    if (typeof _name !== 'string')
    {
        return KEY_NONE;
    }

    let hash = FNV_OFFSET;

    // a key is the reference's hash of the name's bytes, so the name is
    // walked as UTF-8 here, and nowhere else is text taken as bytes
    for (const character of _name)
    {
        const point = character.codePointAt(0);

        // a surrogate with no partner is written as U+FFFD is
        const scalar = ( (point >= 0xD800) &&
                         (point <= 0xDFFF) ) ? 0xFFFD : point;
        const bytes  = (scalar < 0x80)    ? [scalar]
                     : (scalar < 0x800)   ? [0xC0 | (scalar >> 6),
                                             0x80 | (scalar & 0x3F)]
                     : (scalar < 0x10000) ? [0xE0 | (scalar >> 12),
                                             0x80 | ((scalar >> 6) & 0x3F),
                                             0x80 | (scalar & 0x3F)]
                                          : [0xF0 | (scalar >> 18),
                                             0x80 | ((scalar >> 12) & 0x3F),
                                             0x80 | ((scalar >> 6) & 0x3F),
                                             0x80 | (scalar & 0x3F)];

        if (scalar === 0)
        {
            break;
        }

        for (const byte of bytes)
        {
            hash ^= BigInt(byte);
            hash  = BigInt.asUintN(64, hash * FNV_PRIME);
        }
    }

    return (hash === 0n) ? 1n : hash;
}


//==============================================================================
// 2.  VERDICTS
//==============================================================================

// 2.1
/**
 * What a handler gives: PASS, or CONSUME, after which no later handler of
 * the occurrence is invoked.
 */
export const VERDICT = Object.freeze(Object.fromEntries(
    data.verdicts.map((_v) => [strip(_v.name, 'D_VERDICT_'), _v.value])));

// 2.2
/**
 * Whether a verdict is CONSUME.
 *
 * @param {number} _verdict  the verdict.
 * @returns {boolean}
 */
export function verdict_is_consumed(
    _verdict
)
{
    return (_verdict === VERDICT.CONSUME);
}


//==============================================================================
// 3.  STATUSES
//==============================================================================

// 3.1
/**
 * The outcome of a table's or a queue's operation, by the reference's
 * names without their prefix: `STATUS.ERR_NOT_FOUND` is
 * D_EVENT_ERR_NOT_FOUND.
 */
export const STATUS = Object.freeze(Object.fromEntries(
    data.statuses.map((_s) => [strip(_s.name, 'D_EVENT_'), _s.value])));
