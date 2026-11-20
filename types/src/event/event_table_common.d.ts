/**
 * A table with no letters.
 *
 * @param {object} [_room]  the table's room.
 * @param {number} [_room.capacity=Infinity]  the most letters it holds,
 *        those unbound and not yet released among them.
 * @returns {EventTable}
 */
export function tableInit(_room?: {
    capacity?: number | undefined;
}): EventTable;
/**
 * Unbinds every letter the table had when the call began, running each
 * one's `stateFree`. Handler ids are not started again.
 *
 * @param {?EventTable} _table  the table.
 */
export function tableClear(_table: EventTable | null): void;
/**
 * Unbinds every letter of one key's word.
 *
 * @param {?EventTable} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {number} how many were unbound.
 */
export function tableClearKey(_table: EventTable | null, _key: bigint): number;
/**
 * Clears a table and ends it: nothing binds to it afterwards. Asked for
 * by a handler of a dispatch over it, the table is ended when the
 * outermost dispatch is.
 *
 * @param {?EventTable} _table  the table.
 */
export function tableDispose(_table: EventTable | null): void;
/**
 * Appends a letter to a key's word, its mask on.
 *
 * @param {?EventTable} _table  the table.
 * @param {bigint}       _key    the key.
 * @param {EventStep}   _step   the handler.
 * @param {?function(*): void} [_stateFree=null]  called with the step's
 *        state when the letter is unbound or the table cleared; none for
 *        state the caller keeps.
 * @returns {{status: number, id: number}} OK and the letter's id; ERR_NULL
 *          for no table; ERR_STATE for a table that was disposed;
 *          ERR_CAPACITY for one that is full. The id is HANDLER_ID_NULL
 *          for a failure.
 */
export function tableBind(_table: EventTable | null, _key: bigint, _step: EventStep, _stateFree?: ((arg0: any) => void) | null): {
    status: number;
    id: number;
};
/**
 * Unbinds the letter of an id from whichever word holds it, running its
 * `stateFree`.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK; ERR_NOT_FOUND for no such letter; ERR_NULL for no
 *          table.
 */
export function tableUnbind(_table: EventTable | null, _id: number): number;
/**
 * Turns a letter's mask on.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK for a letter that was off; ERR_STATE for one
 *          already on; ERR_NOT_FOUND for no such letter.
 */
export function tableEnable(_table: EventTable | null, _id: number): number;
/**
 * Turns a letter's mask off: it stays in its word and acts as skip.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {number} OK for a letter that was on; ERR_STATE for one
 *          already off; ERR_NOT_FOUND for no such letter.
 */
export function tableDisable(_table: EventTable | null, _id: number): number;
/**
 * Whether a letter is bound and its mask on.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {boolean}
 */
export function tableIsEnabled(_table: EventTable | null, _id: number): boolean;
/**
 * Whether a letter of an id is bound in any word.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {boolean}
 */
export function tableContains(_table: EventTable | null, _id: number): boolean;
/**
 * The letter of an id.
 *
 * @param {?EventTable} _table  the table.
 * @param {number}       _id     the letter's id.
 * @returns {?EventEntry} the letter; null for no such letter.
 */
export function tableFind(_table: EventTable | null, _id: number): EventEntry | null;
/**
 * A key's word: its letters in the order they were bound.
 *
 * @param {?EventTable} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {Array<EventEntry>}
 */
export function tableWord(_table: EventTable | null, _key: bigint): Array<EventEntry>;
/**
 * How many letters are bound, in every word.
 *
 * @param {?EventTable} _table  the table.
 * @returns {number}
 */
export function tableCount(_table: EventTable | null): number;
/**
 * How many bound letters have their mask on.
 *
 * @param {?EventTable} _table  the table.
 * @returns {number}
 */
export function tableEnabledCount(_table: EventTable | null): number;
/**
 * The length of a key's word.
 *
 * @param {?EventTable} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {number}
 */
export function tableCountFor(_table: EventTable | null, _key: bigint): number;
/**
 * Whether a key's word has a letter.
 *
 * @param {?EventTable} _table  the table.
 * @param {bigint}       _key    the key.
 * @returns {boolean}
 */
export function tableHasEntriesFor(_table: EventTable | null, _key: bigint): boolean;
/**
 * How many keys have a word that is not empty.
 *
 * @param {?EventTable} _table  the table.
 * @returns {number}
 */
export function tableKeyCount(_table: EventTable | null): number;
/**
 * Visits every bound letter in ascending id order, which is the order
 * they were bound in, whatever their keys.
 *
 * @param {?EventTable} _table    the table.
 * @param {function(EventEntry): boolean} _visitor  shown each letter;
 *        false stops the walk.
 * @returns {number} how many were visited.
 */
export function tableForEach(_table: EventTable | null, _visitor: (arg0: EventEntry) => boolean): number;
/**
 * Visits one key's word, in word order.
 *
 * @param {?EventTable} _table    the table.
 * @param {bigint}       _key      the key.
 * @param {function(EventEntry): boolean} _visitor  shown each letter;
 *        false stops the walk.
 * @returns {number} how many were visited.
 */
export function tableForEachKey(_table: EventTable | null, _key: bigint, _visitor: (arg0: EventEntry) => boolean): number;
/**
 * Appends every letter of another table to this one, key by key, this
 * one's letters first. The merged letters are given new ids; each keeps
 * its mask. They borrow their state: `stateFree` is not copied, since
 * two tables must not both release one state. The other table is left as
 * it was.
 *
 * @param {?EventTable} _table  the table merged into.
 * @param {?EventTable} _other  the table merged from.
 * @returns {{status: number, merged: number}} OK; ERR_NULL for a table
 *          missing; ERR_CAPACITY for a table that filled, with in
 *          `merged` how far the merge got: it is not undone.
 */
export function tableMerge(_table: EventTable | null, _other: EventTable | null): {
    status: number;
    merged: number;
};
/**
 * What the registry's fold needs of a table and a reader does not: the
 * letters themselves, and the bracket around a dispatch.
 */
export const internal: Readonly<{
    ready: typeof ready;
    dispatchBegin: typeof dispatchBegin;
    dispatchEnd: typeof dispatchEnd;
}>;
/**
 * A table. Made by `tableInit`; read through the functions here.
 */
export type EventTable = {
    /**
     * made by `tableInit`, and not yet disposed.
     */
    ready: boolean;
    /**
     * its letters, in the order they
     * were bound; one unbound during a dispatch stays, a zombie,
     * until the outermost dispatch ends.
     */
    entries: Array<EventLetter>;
    /**
     * the id the next letter bound takes.
     */
    nextId: number;
    /**
     * its letters, zombies not counted.
     */
    count: number;
    /**
     * those of them enabled.
     */
    enabledCount: number;
    /**
     * the most letters it holds.
     */
    capacity: number;
    /**
     * whether a dispatch is under way.
     */
    dispatching: boolean;
    /**
     * whether a letter was unbound during
     * it, to be released when the outermost dispatch ends.
     */
    zombies: boolean;
    /**
     * whether the table was disposed during
     * it, to be cleared when the outermost dispatch ends.
     */
    disposeAsked: boolean;
};
/**
 * A letter as the table holds it.
 */
export type EventLetter = {
    /**
     * its handler id.
     */
    id: number;
    /**
     * the key of its word.
     */
    key: bigint;
    /**
     * the handler.
     */
    step: EventStep;
    /**
     * what releases the step's state.
     */
    stateFree: Function | null;
    /**
     * its mask.
     */
    enabled: boolean;
    /**
     * unbound during a dispatch.
     */
    zombie: boolean;
};
/**
 * A letter, as a reader is shown one.
 */
export type EventEntry = {
    /**
     * its handler id.
     */
    id: number;
    /**
     * the key of its word.
     */
    key: bigint;
    /**
     * the handler.
     */
    step: EventStep;
    /**
     * its mask.
     */
    enabled: boolean;
};
import type { EventStep } from './event_handler_common.js';
/** @import { EventStep } from './event_handler_common.js' */
/**
 * A table. Made by `tableInit`; read through the functions here.
 *
 * @typedef {object} EventTable
 * @property {boolean} ready  made by `tableInit`, and not yet disposed.
 * @property {Array<EventLetter>} entries  its letters, in the order they
 *           were bound; one unbound during a dispatch stays, a zombie,
 *           until the outermost dispatch ends.
 * @property {number}  nextId        the id the next letter bound takes.
 * @property {number}  count         its letters, zombies not counted.
 * @property {number}  enabledCount  those of them enabled.
 * @property {number}  capacity      the most letters it holds.
 * @property {boolean} dispatching   whether a dispatch is under way.
 * @property {boolean} zombies       whether a letter was unbound during
 *           it, to be released when the outermost dispatch ends.
 * @property {boolean} disposeAsked  whether the table was disposed during
 *           it, to be cleared when the outermost dispatch ends.
 */
/**
 * A letter as the table holds it.
 *
 * @typedef {object} EventLetter
 * @property {number}    id         its handler id.
 * @property {bigint}    key        the key of its word.
 * @property {EventStep} step       the handler.
 * @property {?function} stateFree  what releases the step's state.
 * @property {boolean}   enabled    its mask.
 * @property {boolean}   zombie     unbound during a dispatch.
 */
/**
 * A letter, as a reader is shown one.
 *
 * @typedef {object} EventEntry
 * @property {number}     id       its handler id.
 * @property {bigint}     key      the key of its word.
 * @property {EventStep}  step     the handler.
 * @property {boolean}    enabled  its mask.
 */
/**
 * ready
 *   Whether a table was made by `tableInit` and is not yet disposed.
 *
 * @param {*} _table  what may be a table.
 * @returns {_table is EventTable}
 */
declare function ready(_table: any): _table is EventTable;
/**
 * dispatchBegin
 *   Marks the table as dispatching; true when this is the outermost
 * dispatch, the one that must end it.
 *
 * @param {EventTable} _table  the table.
 * @returns {boolean}
 */
declare function dispatchBegin(_table: EventTable): boolean;
/**
 * dispatchEnd
 *   When outermost: clears the mark, releases the letters unbound
 * meanwhile, running their hooks, and ends the table where a handler asked
 * for that.
 *
 * @param {EventTable} _table      the table.
 * @param {boolean}    _outermost  what `dispatchBegin` gave.
 */
declare function dispatchEnd(_table: EventTable, _outermost: boolean): void;
export {};
