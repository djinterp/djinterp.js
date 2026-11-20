/** @import { EventStep } from './event_handler_common.js' */
/** @import { EventTable } from './event_table_common.js' */
/**
 * A registry: `table` is its table, read with event_table_common.js.
 *
 * @typedef {{table: EventTable}} EventRegistry
 */
/**
 * A registry with no letters.
 *
 * @param {object} [_room]  the table's room, as `tableInit` takes it.
 * @returns {EventRegistry}
 */
export function registryInit(_room?: object): EventRegistry;
/**
 * Unbinds every letter and ends the registry.
 *
 * @param {?EventRegistry} _registry  the registry.
 */
export function registryDispose(_registry: EventRegistry | null): void;
/**
 * Appends a letter to a key's word: `tableBind` on the registry's table.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {EventStep}      _step      the handler.
 * @param {?function(*): void} [_stateFree=null]  called with the step's
 *        state when the letter is unbound.
 * @returns {{status: number, id: number}}
 */
export function registryBind(_registry: EventRegistry | null, _key: bigint, _step: EventStep, _stateFree?: ((arg0: any) => void) | null): {
    status: number;
    id: number;
};
/**
 * Unbinds the letter of an id: `tableUnbind` on the registry's table.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {number}          _id        the letter's id.
 * @returns {number}
 */
export function registryUnbind(_registry: EventRegistry | null, _id: number): number;
/**
 * The result of dispatching the empty word: nothing invoked, passed.
 *
 * @returns {{invoked: number, outcome: number}}
 */
export function dispatchResultEmpty(): {
    invoked: number;
    outcome: number;
};
/**
 * Folds a key's word over one occurrence: each enabled letter in the
 * order it was bound, until one consumes.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {*}               _payload   the occurrence's payload, handed to
 *        each handler; the handlers may change what it refers to.
 * @returns {{invoked: number, outcome: number}} how many handlers were
 *          invoked, and the word's VERDICT.
 */
export function registryDispatch(_registry: EventRegistry | null, _key: bigint, _payload: any): {
    invoked: number;
    outcome: number;
};
/**
 * Dispatches a row of occurrences of one key, in order. The word is found
 * for each one, so an edit a handler makes is seen by the next.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @param {Array<*>}        _payloads  each occurrence's payload.
 * @returns {{occurrences: number, handlersInvoked: number,
 *            consumedCount: number}} how many occurrences were
 *          dispatched, how many handlers were invoked over them all, and
 *          how many occurrences were consumed.
 */
export function registryRun(_registry: EventRegistry | null, _key: bigint, _payloads: Array<any>): {
    occurrences: number;
    handlersInvoked: number;
    consumedCount: number;
};
/**
 * A key's enabled letters, copied out in word order: a word that runs with
 * no lookup, and does not see the registry change after it was made.
 *
 * @typedef {{key: bigint, steps: Array<EventStep>}} EventWord
 */
/**
 * Copies out a key's enabled letters as a word.
 *
 * @param {?EventRegistry} _registry  the registry.
 * @param {bigint}          _key       the key.
 * @returns {{status: number, word: ?EventWord}} OK and the word; ERR_NULL
 *          and no word for no registry.
 */
export function registryCompile(_registry: EventRegistry | null, _key: bigint): {
    status: number;
    word: EventWord | null;
};
/**
 * Folds a word over one occurrence.
 *
 * @param {?EventWord} _word     the word; none is the empty word.
 * @param {*}           _payload  the payload.
 * @returns {{verdict: number, invoked: number}}
 */
export function wordRunOne(_word: EventWord | null, _payload: any): {
    verdict: number;
    invoked: number;
};
/**
 * Folds a word over a row of occurrences, in order.
 *
 * @param {?EventWord} _word      the word.
 * @param {Array<*>}    _payloads  each occurrence's payload.
 * @returns {{occurrences: number, consumedCount: number}}
 */
export function wordDrive(_word: EventWord | null, _payloads: Array<any>): {
    occurrences: number;
    consumedCount: number;
};
/**
 * A registry: `table` is its table, read with event_table_common.js.
 */
export type EventRegistry = {
    table: eventTable.EventTable;
};
/**
 * A key's enabled letters, copied out in word order: a word that runs with
 * no lookup, and does not see the registry change after it was made.
 */
export type EventWord = {
    key: bigint;
    steps: Array<EventStep>;
};
import type { EventStep } from './event_handler_common.js';
import * as eventTable from './event_table_common.js';
