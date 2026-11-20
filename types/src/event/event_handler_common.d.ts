/**
 * A handler: a function and the state it is handed.
 *
 * @typedef {object} EventStep
 * @property {?function(*, *): number} fn  takes the occurrence's payload
 *           and `state`; gives a VERDICT. Null for the unit.
 * @property {*} state  what `fn` is handed second.
 */
/**
 * A step from a function and its state.
 *
 * @param {?function(*, *): number} _fn     the function.
 * @param {*}                       [_state=null]  its state.
 * @returns {EventStep}
 */
export function stepMake(_fn: ((arg0: any, arg1: any) => number) | null, _state?: any): EventStep;
/**
 * The unit: a step that passes and is never invoked.
 *
 * @returns {EventStep}
 */
export function stepSkip(): EventStep;
/**
 * Whether a step is the unit.
 *
 * @param {?EventStep} _step  the step.
 * @returns {boolean}
 */
export function stepIsSkip(_step: EventStep | null): boolean;
/**
 * Invokes a step over a payload; the unit passes. The one place the core
 * calls a handler.
 *
 * @param {?EventStep} _step     the step.
 * @param {*}           _payload  the payload.
 * @returns {number} a VERDICT: CONSUME where the handler gave it, else
 *          PASS.
 */
export function stepInvoke(_step: EventStep | null, _payload: any): number;
/**
 * A step over a plain callback, which is handed its context and whose
 * step always passes.
 *
 * @param {?function(*): void} _callback  the callback; with none, the
 *        step passes without a call.
 * @param {*} [_context=null]  what it is handed.
 * @returns {EventStep}
 */
export function stepFromCallback(_callback: ((arg0: any) => void) | null, _context?: any): EventStep;
/**
 * Two steps as one: the first, then the second unless the first consumed.
 *
 * @param {EventStep} _first   the first.
 * @param {EventStep} _second  the second.
 * @returns {EventStep}
 */
export function stepSeq(_first: EventStep, _second: EventStep): EventStep;
/**
 * Folds a word of steps over one payload, in order, stopping at the first
 * consume. The unit is passed over and not counted.
 *
 * @param {?Array<EventStep>} _steps    the word.
 * @param {*}                  _payload  the payload.
 * @returns {{verdict: number, invoked: number}} the word's VERDICT, and
 *          how many steps were invoked.
 */
export function stepFold(_steps: Array<EventStep> | null, _payload: any): {
    verdict: number;
    invoked: number;
};
/**
 * A handler: a function and the state it is handed.
 */
export type EventStep = {
    /**
     * takes the occurrence's payload
     * and `state`; gives a VERDICT. Null for the unit.
     */
    fn: ((arg0: any, arg1: any) => number) | null;
    /**
     * what `fn` is handed second.
     */
    state: any;
};
