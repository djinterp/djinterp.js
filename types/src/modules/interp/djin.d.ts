/**
 * A status's name; "unknown" for a value that is none.
 *
 * @param {number} _status  the status.
 * @returns {string} the name.
 */
export function statusName(_status: number): string;
/**
 * A set of records. Made by `setInit`; read through the functions here.
 *
 * @typedef {object} DjinSet
 */
/**
 * A set with no records.
 *
 * @param {object} [_options]  what the set is made over.
 * @param {number} [_options.capacity=Infinity]  the most records it
 *        takes.
 * @param {?OptionEnvRegistry} [_options.registry=null]  the registry a
 *        record's settings are listed in.
 * @param {ReadonlyArray<string>} [_options.reserved=[]]  the names the program
 *        keeps for itself.
 * @returns {DjinSet}
 */
export function setInit(_options?: {
    capacity?: number;
    registry?: optionEnvRegistry.OptionEnvRegistry | null;
    reserved?: ReadonlyArray<string>;
}): DjinSet;
/**
 * Takes a record into a set, and lists its settings in the set's
 * registry.
 *
 * @param {DjinSet}    _set   the set.
 * @param {DjinRecord} _djin  the record; kept, and what `setFind` gives.
 * @returns {number} a STATUS: INVALID for a record that is not well
 *          formed; RESERVED for a name the program keeps; DUPLICATE for a
 *          name the set has, or whose settings' name another frame in the
 *          registry has; FULL for a set that is full; SETTINGS for
 *          settings with no registry to list them in, or that the
 *          registry refuses.
 */
export function register(_set: DjinSet, _djin: DjinRecord): number;
/**
 * How many records a set has.
 *
 * @param {?DjinSet} _set  the set.
 * @returns {number}
 */
export function setCount(_set: DjinSet | null): number;
/**
 * The record at a place, in the order they were taken.
 *
 * @param {?DjinSet} _set    the set.
 * @param {number}    _index  the place, from 0.
 * @returns {?DjinRecord} the record; null past the last.
 */
export function setAt(_set: DjinSet | null, _index: number): DjinRecord | null;
/**
 * The record of a name.
 *
 * @param {?DjinSet} _set   the set.
 * @param {string}    _name  the name.
 * @returns {?DjinRecord} the record; null for no such djin.
 */
export function setFind(_set: DjinSet | null, _name: string): DjinRecord | null;
/**
 * A djin's command of a name.
 *
 * @param {?DjinRecord} _djin  the record.
 * @param {string}       _name  the command's name.
 * @returns {?DjinCommand} the command; null for no such command.
 */
export function commandFind(_djin: DjinRecord | null, _name: string): DjinCommand | null;
/**
 * The list of a set's djins, a line each: name, version and summary in
 * columns; then each frame of the registry that has settings and no
 * record, as "settings only".
 *
 * The reference writes to a sink and returns 0; this returns the text.
 *
 * @param {?DjinSet} _set  the set.
 * @returns {?string} the text; null for no set.
 */
export function writeList(_set: DjinSet | null): string | null;
/**
 * A djin's description: its name and version, its summary, its commands,
 * and its settings with their kinds, defaults, knobs and help.
 *
 * @param {?DjinRecord} _djin  the record.
 * @returns {?string} the text; null for no record.
 */
export function writeDescription(_djin: DjinRecord | null): string | null;
/**
 * The description of a frame of settings that has no record.
 *
 * @param {?OptionEnv} _frame  the frame; one with a name.
 * @returns {?string} the text; null for no frame, or one with no name.
 */
export function writeFrame(_frame: optionEnv.OptionEnv | null): string | null;
/** The record's ABI number: D_DJIN_ABI. */
export const ABI: number;
/**
 * What `register` answers, by the reference's names without their prefix.
 */
export const STATUS: Readonly<{
    OK: 0;
    INVALID: 1;
    DUPLICATE: 2;
    RESERVED: 3;
    FULL: 4;
    SETTINGS: 5;
}>;
/**
 * The writers without their checks, and a record as they hold one, for
 * the program's commands.
 */
export const inner: Readonly<{
    normal: typeof normal;
    find: typeof findNormal;
    list: typeof listInner;
    description: typeof descriptionInner;
    frame: typeof frameInner;
}>;
/**
 * A djin's record: the reference's struct dj_djin, less its size.
 */
export type DjinRecord = {
    /**
     * a lowercase word: a letter, then letters,
     * digits and '_'.
     */
    name: string;
    /**
     * one line, not empty.
     */
    version: string;
    /**
     * one line, not empty.
     */
    summary: string;
    /**
     * its commands.
     */
    commands?: Array<DjinCommand> | null;
    /**
     * its settings: a frame named as the
     * djin is.
     */
    settings?: optionEnv.OptionEnv | null;
    /**
     * the ABI it was written to; the current
     * one where left out.
     */
    abi?: number;
};
/**
 * A djin's command: the reference's struct dj_djin_command, less its size.
 */
export type DjinCommand = {
    /**
     * a lowercase word: a letter, then letters,
     * digits and '-'.
     */
    name: string;
    /**
     * one line, not empty.
     */
    summary: string;
    /**
     * what carries it out.
     */
    run?: Function | null;
    /**
     * what `run` is handed.
     */
    context?: any;
};
/**
 * A set of records. Made by `setInit`; read through the functions here.
 */
export type DjinSet = object;
import * as optionEnvRegistry from '../../option/option_env_registry.js';
import * as optionEnv from '../../option/option_env.js';
declare function normal(_djin: any): {
    record: any;
    abi: any;
    name: any;
    version: any;
    summary: any;
    commands: any;
    settings: any;
};
declare function findNormal(_set: any, _name: any): any;
declare function listInner(_set: any): string;
declare function descriptionInner(_djin: any): string;
declare function frameInner(_frame: any): string;
export {};
