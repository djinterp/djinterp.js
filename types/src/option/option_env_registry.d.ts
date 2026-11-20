/**
 * A registry with no djins, its root frame named.
 *
 * @param {?string} _name  the root's name, an identifier: what the
 *        program is called.
 * @param {object}  [_room]  the registry's room; the reference's where
 *        left out.
 * @param {number}  [_room.bindings]  the root's bindings.
 * @param {number}  [_room.vars]      the root's variables.
 * @param {number}  [_room.text]      the root's units of text.
 * @param {number}  [_room.djins]     the djins.
 * @returns {OptionResult & {registry: OptionEnvRegistry}} the
 *          registry in `registry`, made whatever the result;
 *          INVALID_ARGUMENT for a name that is no identifier, which
 *          leaves the root unnamed.
 */
export function init(_name: string | null, _room?: {
    bindings?: number;
    vars?: number;
    text?: number;
    djins?: number;
}): OptionResult & {
    registry: OptionEnvRegistry;
};
/**
 * The program's registry: one for the module, its root named "djinterp",
 * as the reference's is.
 *
 * @returns {OptionEnvRegistry}
 */
export function registry(): OptionEnvRegistry;
/**
 * A registry's root frame.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @returns {?OptionEnv} the frame; null for no registry.
 */
export function frame(_registry: OptionEnvRegistry | null): optionEnv.OptionEnv | null;
/**
 * Lists a named frame as a djin, under the root. The frame's own bindings
 * are dropped, as `optionEnv.setParent` drops them.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {OptionEnv}          _djin      the frame; one with a name.
 * @returns {OptionResult} its place; INVALID_ARGUMENT for a frame with
 *          no name, or the root itself; KEY_DUPLICATE for a name a djin
 *          has; CAPACITY for a registry that is full.
 */
export function add(_registry: OptionEnvRegistry, _djin: optionEnv.OptionEnv): OptionResult;
/**
 * Takes a djin's frame out of the registry and from under the root.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {OptionEnv}          _djin      the frame.
 * @returns {OptionResult} the place it had; KEY_ABSENT for a frame that
 *          is not listed.
 */
export function remove(_registry: OptionEnvRegistry, _djin: optionEnv.OptionEnv): OptionResult;
/**
 * How many djins a registry lists.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @returns {number}
 */
export function count(_registry: OptionEnvRegistry | null): number;
/**
 * The djin at a place, in the order they were added.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {number}               _index     the place, from 0.
 * @returns {?OptionEnv} the frame; null past the last.
 */
export function at(_registry: OptionEnvRegistry | null, _index: number): optionEnv.OptionEnv | null;
/**
 * The djin of a name.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {string}               _name      the name.
 * @returns {?OptionEnv} the frame; null for no such djin.
 */
export function find(_registry: OptionEnvRegistry | null, _name: string): optionEnv.OptionEnv | null;
/**
 * The frame a full name is a setting of: the djin named before its first
 * point, or the root.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {string}               _name      the full name.
 * @returns {?OptionEnv} the frame; null for no registry.
 */
export function target(_registry: OptionEnvRegistry | null, _name: string): optionEnv.OptionEnv | null;
/**
 * Binds a setting by its full name from a value's text, from a source: as
 * `optionEnv.assignFrom`, in the frame the name is a setting of.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string}              _name      the full name.
 * @param {string}              _value     the value's text.
 * @param {number}              _source    the source; any but DEFAULT.
 * @returns {OptionResult}
 */
export function assign(_registry: OptionEnvRegistry, _name: string, _value: string, _source: number): OptionResult;
/**
 * Carries out one statement by full name, from a source: as
 * `optionEnv.putFrom`, in the frame its name is a setting of.
 *
 * @param {OptionEnvRegistry} _registry   the registry.
 * @param {string}              _statement  the statement; read up to a
 *        NUL.
 * @param {number}              _source     the source; any but DEFAULT.
 * @returns {OptionResult}
 */
export function put(_registry: OptionEnvRegistry, _statement: string, _source: number): OptionResult;
/**
 * Carries out a script of statements by full name, from a source: as
 * `optionEnv.loadFrom`, each statement in the frame its name is a
 * setting of. It stops at the first statement refused.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string}              _script    the script; read up to a NUL.
 * @param {number}              _source    the source; any but DEFAULT.
 * @returns {OptionResult & {errorOffset?: number}} how many statements
 *          were carried out; or the refusal, with in `errorOffset` where
 *          the refused statement starts, an index into the script.
 */
export function load(_registry: OptionEnvRegistry, _script: string, _source: number): OptionResult & {
    errorOffset?: number;
};
/**
 * Binds, as the environment, every setting the environment names: the
 * root's as PREFIX and the name in upper case, a djin's as PREFIX, the
 * djin's name in upper case, '_' and the name. A value refused does not
 * stop the rest.
 *
 * The reference reads the process's environment; a page gives one.
 * Exported as `import` too.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {?string}             _prefix    what each name follows, or
 *        null for nothing.
 * @param {Map<string, string>|Record<string, string>|
 *         function(string): (string|undefined)} _environment  the
 *        environment: names to values.
 * @returns {OptionResult} how many were bound; or the first refusal.
 */
export function import_(_registry: OptionEnvRegistry, _prefix: string | null, _environment: Map<string, string> | Record<string, string> | ((arg0: string) => (string | undefined))): OptionResult;
/**
 * Takes one option of a command line as a setting, from the command line:
 * "--set NAME=VALUE", "--NAME=VALUE", "--NAME" for a BOOL made true and
 * "--no-NAME" for one made false.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {Array<string>}       _argv      the command line's arguments.
 * @param {number}              _at        which one to look at.
 * @returns {{took: number, at: number, result: ?OptionResult}}
 *          `took` is 1 for a setting bound, 0 for an argument that is no
 *          option of this form, with no result, and -1 for one that is
 *          and is refused, with why in `result`. `at` is the last
 *          argument used: `_at`, or the one after it for "--set".
 */
export function takeOption(_registry: OptionEnvRegistry, _argv: Array<string>, _at: number): {
    took: number;
    at: number;
    result: OptionResult | null;
};
/**
 * The full name a mistyped one was probably meant to be: its djin
 * corrected, or its scope, or its variable.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string}              _name      the full name as written.
 * @returns {string} the full name; empty where none is near.
 */
export function suggest(_registry: OptionEnvRegistry, _name: string): string;
/**
 * The registry without its checks, for the modules that stand on it.
 */
export const inner: Readonly<{
    find: typeof findInner;
    target: typeof targetInner;
    assign: typeof assignInner;
    put: typeof putInner;
    load: typeof loadInner;
    import: typeof importInner;
    takeOption: typeof takeOptionInner;
    suggest: typeof suggestInner;
}>;
/**
 * A registry. Made by `init`; read through the functions here.
 */
export type OptionEnvRegistry = {
    /**
     * its root frame.
     */
    frame: optionEnv.OptionEnv;
    /**
     * the djins' frames it lists, each
     * with a name, in the order they were added.
     */
    djins: Array<optionEnv.OptionEnv>;
    /**
     * the most djins it lists.
     */
    capacity: number;
};
import type { OptionResult } from './option_common.js';
import * as optionEnv from './option_env.js';
/**
 * findInner
 *   `find`, for a name that is a string or null.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {?string}            _name      the name.
 * @returns {?OptionEnv} the frame; null for no such djin.
 */
declare function findInner(_registry: OptionEnvRegistry | null, _name: string | null): optionEnv.OptionEnv | null;
/**
 * targetInner
 *   `target`, for a name that is a string or null.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {?string}            _name      the full name.
 * @returns {?OptionEnv} the frame; null for no registry, or no name.
 */
declare function targetInner(_registry: OptionEnvRegistry | null, _name: string | null): optionEnv.OptionEnv | null;
/**
 * assignInner
 *   `assign`, for a name that is a string or null, and a value that is
 * a string.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {?string}            _name      the full name.
 * @param {string}             _value     the value's text.
 * @param {number}             _source    the source.
 * @returns {OptionResult}
 */
declare function assignInner(_registry: OptionEnvRegistry | null, _name: string | null, _value: string, _source: number): OptionResult;
/**
 * putInner
 *   `put`, for a statement as the reference holds it, or null.
 *
 * @param {?OptionEnvRegistry} _registry   the registry.
 * @param {?string}            _statement  the statement.
 * @param {number}             _source     the source.
 * @returns {OptionResult}
 */
declare function putInner(_registry: OptionEnvRegistry | null, _statement: string | null, _source: number): OptionResult;
/**
 * loadInner
 *   `load`, for a script as the reference holds it, or null.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {?string}            _script    the script.
 * @param {number}             _source    the source.
 * @returns {OptionResult & {errorOffset?: number}}
 */
declare function loadInner(_registry: OptionEnvRegistry | null, _script: string | null, _source: number): OptionResult & {
    errorOffset?: number;
};
/**
 * importInner
 *   `import`, for a prefix as the reference holds it, and a lookup.
 *
 * @param {?OptionEnvRegistry}                   _registry  the registry.
 * @param {string}                               _prefix    what each name
 *        follows.
 * @param {function(string): (string|undefined)} _lookup    the environment, as
 *        `optionEnv.lookupOf` makes one.
 * @returns {OptionResult} how many were bound; or the first refusal.
 */
declare function importInner(_registry: OptionEnvRegistry | null, _prefix: string, _lookup: (arg0: string) => (string | undefined)): OptionResult;
/**
 * takeOptionInner
 *   `takeOption`, for arguments as the reference holds them.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {*}                  _argv      the command line's
 *        arguments; anything else takes nothing.
 * @param {*}                  _at        which one to look at.
 * @returns {{took: number, at: number, result: ?OptionResult}}
 */
declare function takeOptionInner(_registry: OptionEnvRegistry | null, _argv: any, _at: any): {
    took: number;
    at: number;
    result: OptionResult | null;
};
/**
 * suggestInner
 *   `suggest`, for a name that is a string or null.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {?string}            _name      the full name as
 *        written.
 * @returns {string} the full name; empty where none is near.
 */
declare function suggestInner(_registry: OptionEnvRegistry | null, _name: string | null): string;
export { import_ as import, _import as import };
