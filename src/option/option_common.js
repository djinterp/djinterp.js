/*******************************************************************************
* djinterp.js [option]                                          option_common.js
*
*   What every part of the option machine answers with: a result that is a
* value or a status, and the statuses with the reference's own codes, names
* and messages. An expected failure is a value here, as it is in the
* reference; nothing in the machine throws one.
*   The statuses are not typed here: generated/option.js holds what
* tools/rows_json.c asked of d_option_status_name and
* d_option_status_message.
*   reference: inc/djinterp/c/option/option_common.h, at 3eb096c9
*
*
* path:      /src/option/option_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.17
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  STATUSES
    --------
    1.  STATUS
    2.  STATUS_MECHANICAL_FLOOR
    3.  statusName
    4.  statusMessage
    5.  statusIsMechanical
2.  RESULTS
    -------
    1.  ok
    2.  fail
    3.  resultStatus
*/

import data from '../../generated/option.js';


//==============================================================================
// 1.  STATUSES
//==============================================================================

const BY_CODE = new Map(data.statuses.map((_status) =>
                                              [_status.code, _status]));

// 1.1
/**
 * The statuses, by the reference's names without their prefix:
 * `STATUS.KEY_ABSENT` is D_OPTION_STATUS_KEY_ABSENT.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const STATUS = Object.freeze(Object.fromEntries(
    data.statuses.map((_status) => [_status.name, _status.code])));

// 1.2
/**
 * The first mechanical status: one that says the machine ran out of room,
 * not that what it was asked is wrong.
 *
 * @type {number}
 */
export const STATUS_MECHANICAL_FLOOR = data.mechanical_floor;

// 1.3
/**
 * A status's name, as the reference spells it; "UNKNOWN" for a code that is
 * none.
 *
 * @param {number} _status  the code.
 * @returns {string} the name.
 */
export function statusName(
    _status
)
{
    return BY_CODE.get(_status)?.name ?? data.status_unknown.name;
}

// 1.4
/**
 * A status's message, in the reference's words.
 *
 * @param {number} _status  the code.
 * @returns {string} the message.
 */
export function statusMessage(
    _status
)
{
    return BY_CODE.get(_status)?.message ?? data.status_unknown.message;
}

// 1.5
/**
 * Whether a status is mechanical.
 *
 * @param {number} _status  the code.
 * @returns {boolean}
 */
export function statusIsMechanical(
    _status
)
{
    return (_status >= STATUS_MECHANICAL_FLOOR);
}


//==============================================================================
// 2.  RESULTS
//==============================================================================

/**
 * What an operation answers: `isOk` with a `value`, or not with an
 * `error`, which is a status. The reference's struct dj_option_result, its
 * payload's two members side by side. An operation whose reference has an
 * out-parameter adds that as a member of its own, named in its note.
 *
 * @typedef {{isOk: boolean, value?: number, error?: number}} OptionResult
 */

// 2.1
/**
 * A success.
 *
 * @param {number} _value  what it carries.
 * @returns {OptionResult}
 */
export function ok(
    _value
)
{
    return { isOk: true, value: _value };
}

// 2.2
/**
 * A failure.
 *
 * @param {number} _status  why.
 * @returns {OptionResult}
 */
export function fail(
    _status
)
{
    return { isOk: false, error: _status };
}

// 2.3
/**
 * A result's status: OK for a success, the error for a failure.
 *
 * @param {OptionResult} _result  the result.
 * @returns {number} the status.
 */
export function resultStatus(
    _result
)
{
    // a failure has its status
    return _result.isOk ? STATUS.OK
                        : /** @type {number} */ (_result.error);
}
