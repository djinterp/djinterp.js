/*******************************************************************************
* djinterp.js [event]                                    event_handler_common.js
*
*   A handler, as the event core holds one: a STEP, the pair of a function
* and the state it is handed. A step with no function is the unit, `skip`,
* which passes without being invoked. Steps compose: `seq` runs one and
* then another unless the first consumed, and `fold` runs a whole word of
* them, stopping at the first consume. With skip as its unit and consume
* as its left zero, composition is a monoid, and the suite checks its laws.
*   The reference builds a composed step in storage its caller supplies,
* since C allocates nothing here. JavaScript does: `stepSeq` and
* `stepFromCallback` return a step that holds what it needs.
*   reference: inc/djinterp/c/event/event_handler_common.h and
*              src/djinterp/c/event/event_handler_common.c, at dfc793c4
*
*
* path:      /src/event/event_handler_common.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The step
    1.  stepMake, stepSkip, stepIsSkip, stepInvoke
2.  Adapting a callback
    1.  stepFromCallback
3.  Sequencing
    1.  stepSeq
4.  Folding a word
    1.  stepFold
*/

import { VERDICT, verdictIsConsumed } from './event_common.js';


//==============================================================================
// 1.  THE STEP
//==============================================================================

/**
 * A handler: a function and the state it is handed.
 *
 * @typedef {object} EventStep
 * @property {?function(*, *): number} fn  takes the occurrence's payload
 *           and `state`; gives a VERDICT. Null for the unit.
 * @property {*} state  what `fn` is handed second.
 */

// 1.1
/**
 * A step from a function and its state.
 *
 * @param {?function(*, *): number} _fn     the function.
 * @param {*}                       [_state=null]  its state.
 * @returns {EventStep}
 */
export function stepMake(
    _fn,
    _state = null
)
{
    return { fn: _fn ?? null, state: _state };
}

/**
 * The unit: a step that passes and is never invoked.
 *
 * @returns {EventStep}
 */
export function stepSkip()
{
    return stepMake(null, null);
}

/**
 * Whether a step is the unit.
 *
 * @param {?EventStep} _step  the step.
 * @returns {boolean}
 */
export function stepIsSkip(
    _step
)
{
    return ( (!_step) ||
             (!_step.fn) );
}

/**
 * Invokes a step over a payload; the unit passes. The one place the core
 * calls a handler.
 *
 * @param {?EventStep} _step     the step.
 * @param {*}           _payload  the payload.
 * @returns {number} a VERDICT: CONSUME where the handler gave it, else
 *          PASS.
 */
export function stepInvoke(
    _step,
    _payload
)
{
    if ( (_step === null)  ||
         (_step.fn === null) ||
         stepIsSkip(_step) )
    {
        return VERDICT.PASS;
    }

    return verdictIsConsumed(_step.fn(_payload, _step.state))
               ? VERDICT.CONSUME
               : VERDICT.PASS;
}


//==============================================================================
// 2.  ADAPTING A CALLBACK
//==============================================================================

// 2.1
/**
 * A step over a plain callback, which is handed its context and whose
 * step always passes.
 *
 * @param {?function(*): void} _callback  the callback; with none, the
 *        step passes without a call.
 * @param {*} [_context=null]  what it is handed.
 * @returns {EventStep}
 */
export function stepFromCallback(
    _callback,
    _context = null
)
{
    return stepMake((_payload, _state) =>
    {
        if (_state.fn)
        {
            _state.fn(_state.context);
        }

        return VERDICT.PASS;
    }, { fn: _callback ?? null, context: _context });
}


//==============================================================================
// 3.  SEQUENCING
//==============================================================================

// 3.1
/**
 * Two steps as one: the first, then the second unless the first consumed.
 *
 * @param {EventStep} _first   the first.
 * @param {EventStep} _second  the second.
 * @returns {EventStep}
 */
export function stepSeq(
    _first,
    _second
)
{
    return stepMake((_payload, _node) =>
    {
        // consume is the left zero: the second stage is never invoked
        if (verdictIsConsumed(stepInvoke(_node.first, _payload)))
        {
            return VERDICT.CONSUME;
        }

        return stepInvoke(_node.second, _payload);
    }, { first: _first, second: _second });
}


//==============================================================================
// 4.  FOLDING A WORD
//==============================================================================

// 4.1
/**
 * Folds a word of steps over one payload, in order, stopping at the first
 * consume. The unit is passed over and not counted.
 *
 * @param {?Array<EventStep>} _steps    the word.
 * @param {*}                  _payload  the payload.
 * @returns {{verdict: number, invoked: number}} the word's VERDICT, and
 *          how many steps were invoked.
 */
export function stepFold(
    _steps,
    _payload
)
{
    let invoked = 0;
    let verdict = VERDICT.PASS;

    for (const step of (_steps ?? []))
    {
        // the unit passes without being invoked
        if (stepIsSkip(step))
        {
            continue;
        }

        ++invoked;

        // consume is the left zero: the remainder is not invoked
        if (verdictIsConsumed(stepInvoke(step, _payload)))
        {
            verdict = VERDICT.CONSUME;

            break;
        }
    }

    return { verdict: verdict, invoked: invoked };
}
