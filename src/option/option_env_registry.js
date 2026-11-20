/*******************************************************************************
* djinterp.js [option]                                    option_env_registry.js
*
*   A program's settings in one place: a root frame for what is the
* program's own, and under it one frame a djin, each named. A setting is
* reached by its full name, "djin.name" or "djin.scope.name", and a name
* with no djin before it is the root's. The registry routes a statement, a
* script, the environment and a command line's options to the frame each
* names, and suggests the full name a mistyped one was meant to be.
*   Like option_env.js, the exported functions check what they are
* handed, and `inner` has the same without the checks.
*   The reference's registry has room for a fixed number of djins and its
* root for fixed numbers of variables, bindings and units of text, each a
* knob (cfg_option_env.h). A registry here has the reference's default
* room unless `init` is given other.
*   reference: inc/djinterp/c/option/option_env_registry.h and
*              src/djinterp/c/option/option_env_registry.c, at 3eb096c9
*
*
* path:      /src/option/option_env_registry.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  The registry
    1.  registry
    2.  init
    3.  frame
    4.  add, remove
    5.  count, at, find, target
2.  Settings by full name
    1.  assign, put, load
    2.  import
    3.  takeOption
    4.  suggest
3.  Inner
    1.  inner
*/

import data from '../../generated/option.js';
import { STATUS, fail, ok } from './option_common.js';
import * as optionEnv from './option_env.js';

// the types of other modules that this one's comments name
/** @import { OptionEnv } from './option_env.js' */
/** @import { OptionResult } from './option_common.js' */

const PREFIX_ROOM = 256;
const REGISTRY    = Symbol('option_env_registry');
const envInner    = optionEnv.inner;


//==============================================================================
// 1.  THE REGISTRY
//==============================================================================

/**
 * A registry. Made by `init`; read through the functions here.
 *
 * @typedef {object} OptionEnvRegistry
 */

let program = null;

function isRegistry(
    _registry
)
{
    return ( (_registry !== null)            &&
             (typeof _registry === 'object') &&
             (_registry[REGISTRY] === true) );
}

// 1.2
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
export function init(
    _name,
    _room = {}
)
{
    const registry = {
        [REGISTRY]: true,
        frame:      optionEnv.init({
            bindings: _room.bindings ?? data.registry.bindings,
            vars:     _room.vars ?? data.registry.variables,
            text:     _room.text ?? data.registry.text
        }),
        djins:      [],
        capacity:   _room.djins ?? data.registry.djins
    };

    return { ...optionEnv.setName(registry.frame, _name),
             registry: registry };
}

// 1.1
/**
 * The program's registry: one for the module, its root named "djinterp",
 * as the reference's is.
 *
 * @returns {OptionEnvRegistry}
 */
export function registry()
{
    if (program === null)
    {
        program = init('djinterp').registry;
    }

    return program;
}

// 1.3
/**
 * A registry's root frame.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @returns {?OptionEnv} the frame; null for no registry.
 */
export function frame(
    _registry
)
{
    return isRegistry(_registry) ? _registry.frame : null;
}

function findInner(
    _registry,
    _name
)
{
    if ( !isRegistry(_registry) ||
         (_name === null) )
    {
        return null;
    }

    for (const djin of _registry.djins)
    {
        if (djin.name === _name)
        {
            return djin;
        }
    }

    return null;
}

// 1.4
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
export function add(
    _registry,
    _djin
)
{
    if ( !isRegistry(_registry)   ||
         (_djin === null)         ||
         (_djin === undefined)    ||
         (_djin.name === null)    ||
         (_djin.name === undefined) ||
         (_djin === _registry.frame) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if (findInner(_registry, _djin.name) !== null)
    {
        return fail(STATUS.KEY_DUPLICATE);
    }

    if (_registry.djins.length >= _registry.capacity)
    {
        return fail(STATUS.CAPACITY);
    }

    const attached = optionEnv.setParent(_djin, _registry.frame);

    if (!attached.isOk)
    {
        return attached;
    }

    _registry.djins.push(_djin);

    return ok(_registry.djins.length - 1);
}

/**
 * Takes a djin's frame out of the registry and from under the root.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {OptionEnv}          _djin      the frame.
 * @returns {OptionResult} the place it had; KEY_ABSENT for a frame that
 *          is not listed.
 */
export function remove(
    _registry,
    _djin
)
{
    if ( !isRegistry(_registry) ||
         (_djin === null)       ||
         (_djin === undefined) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const index = _registry.djins.indexOf(_djin);

    if (index < 0)
    {
        return fail(STATUS.KEY_ABSENT);
    }

    optionEnv.detach(_djin);
    _registry.djins.splice(index, 1);

    return ok(index);
}

// 1.5
/**
 * How many djins a registry lists.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @returns {number}
 */
export function count(
    _registry
)
{
    return isRegistry(_registry) ? _registry.djins.length : 0;
}

/**
 * The djin at a place, in the order they were added.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {number}               _index     the place, from 0.
 * @returns {?OptionEnv} the frame; null past the last.
 */
export function at(
    _registry,
    _index
)
{
    return ( isRegistry(_registry) &&
             (_index >= 0)         &&
             (_index < _registry.djins.length) ) ? _registry.djins[_index]
                                                 : null;
}

/**
 * The djin of a name.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {string}               _name      the name.
 * @returns {?OptionEnv} the frame; null for no such djin.
 */
export function find(
    _registry,
    _name
)
{
    return findInner(_registry, (typeof _name === 'string') ? _name
                                                            : null);
}

function targetInner(
    _registry,
    _name
)
{
    if ( !isRegistry(_registry) ||
         (_name === null) )
    {
        return null;
    }

    const dot = _name.indexOf('.');

    if (dot >= 0)
    {
        const djin = findInner(_registry, _name.slice(0, dot));

        if (djin !== null)
        {
            return djin;
        }
    }

    return _registry.frame;
}

/**
 * The frame a full name is a setting of: the djin named before its first
 * point, or the root.
 *
 * @param {?OptionEnvRegistry} _registry  the registry.
 * @param {string}               _name      the full name.
 * @returns {?OptionEnv} the frame; null for no registry.
 */
export function target(
    _registry,
    _name
)
{
    return targetInner(_registry, (typeof _name === 'string')
                                      ? _name
                                      : null);
}


//==============================================================================
// 2.  SETTINGS BY FULL NAME
//==============================================================================

/*
route
  The frame a statement is for: that of the name it starts with, after any
space and '-'.
*/
function route(
    _registry,
    _text
)
{
    const size = _text.length;
    let   i    = 0;

    while ( (i < size) &&
            ( (_text[i] === ' ')  ||
              (_text[i] === '\t') ||
              (_text[i] === '-') ) )
    {
        ++i;
    }

    const start = i;

    while ( (i < size) &&
            ( ((_text[i] >= 'a') && (_text[i] <= 'z')) ||
              ((_text[i] >= 'A') && (_text[i] <= 'Z')) ||
              ((_text[i] >= '0') && (_text[i] <= '9')) ||
              (_text[i] === '_')                       ||
              (_text[i] === '.') ) )
    {
        ++i;
    }

    return targetInner(_registry, _text.slice(start, i));
}

function assignInner(
    _registry,
    _name,
    _value,
    _source
)
{
    const frame_ = targetInner(_registry, _name);

    if (frame_ === null)
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return envInner.assignFrom(frame_, _name, _value, _source);
}

// 2.1
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
export function assign(
    _registry,
    _name,
    _value,
    _source
)
{
    return assignInner(_registry,
                       (typeof _name === 'string') ? _name : null,
                       (typeof _value === 'string') ? _value : '',
                       _source);
}

function putInner(
    _registry,
    _statement,
    _source
)
{
    if ( !isRegistry(_registry) ||
         (_statement === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return envInner.putNFrom(route(_registry, _statement), _statement,
                             _source);
}

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
export function put(
    _registry,
    _statement,
    _source
)
{
    return putInner(_registry,
                    (typeof _statement === 'string')
                        ? envInner.cstr(_statement)
                        : null,
                    _source);
}

function loadInner(
    _registry,
    _script,
    _source
)
{
    let i      = 0;
    let loaded = 0;

    if ( !isRegistry(_registry) ||
         (_script === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const size = _script.length;

    while (i < size)
    {
        const start = i;

        i = envInner.statementEnd(_script, i);

        // a statement of nothing but space is skipped
        let first = start;

        while ( (first < i) &&
                ( (_script[first] === ' ')  ||
                  (_script[first] === '\t') ||
                  (_script[first] === '\r') ) )
        {
            ++first;
        }

        if (first < i)
        {
            const text   = _script.slice(first, i);
            const result = envInner.putNFrom(route(_registry, text), text,
                                             _source);

            if (!result.isOk)
            {
                return { ...result, errorOffset: first };
            }

            ++loaded;
        }

        // a comment runs to its line's end
        if (_script[i] === '#')
        {
            while ( (i < size) &&
                    (_script[i] !== '\n') )
            {
                ++i;
            }
        }

        if (i < size)
        {
            ++i;
        }
    }

    return ok(loaded);
}

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
export function load(
    _registry,
    _script,
    _source
)
{
    return loadInner(_registry,
                     (typeof _script === 'string')
                         ? envInner.cstr(_script)
                         : null,
                     _source);
}

function importInner(
    _registry,
    _prefix,
    _lookup
)
{
    if (!isRegistry(_registry))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    let result  = envInner.import(_registry.frame, _prefix, _lookup);
    let total   = result.isOk ? result.value : 0;
    let failure = result.isOk ? ok(0) : result;

    for (const djin of _registry.djins)
    {
        if (_prefix.length + djin.name.length + 1 >= PREFIX_ROOM)
        {
            continue;
        }

        let prefix = _prefix;

        for (let c = 0; c < djin.name.length; ++c)
        {
            prefix += ( (djin.name[c] >= 'a') &&
                        (djin.name[c] <= 'z') )
                          ? String.fromCharCode(djin.name.charCodeAt(c) - 32)
                          : djin.name[c];
        }

        result = envInner.import(djin, prefix + '_', _lookup);
        total += result.isOk ? result.value : 0;

        if ( !result.isOk &&
             failure.isOk )
        {
            failure = result;
        }
    }

    return failure.isOk ? ok(total) : failure;
}

// 2.2
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
export function import_(
    _registry,
    _prefix,
    _environment
)
{
    return importInner(_registry,
                       (typeof _prefix === 'string')
                           ? envInner.cstr(_prefix)
                           : '',
                       envInner.lookupOf(_environment));
}

export { import_ as import };

/*
isBool
  1 where a full name is a BOOL's, 0 where another kind's, -1 where none's.
*/
function isBool(
    _registry,
    _name
)
{
    const frame_ = targetInner(_registry, _name);

    if (frame_ === null)
    {
        return -1;
    }

    const found = envInner.resolve(frame_, _name);

    if (!found.isOk)
    {
        return -1;
    }

    const value = envInner.get(frame_, found.scope, found.value);

    if (!value.isOk)
    {
        return -1;
    }

    return (value.got.kind === optionEnv.KIND.BOOL) ? 1 : 0;
}

function takeOptionInner(
    _registry,
    _argv,
    _at
)
{
    const refusal = fail(STATUS.INVALID_ARGUMENT);

    if ( !isRegistry(_registry)         ||
         !Array.isArray(_argv)          ||
         !Number.isInteger(_at)         ||
         (_at < 0)                      ||
         (_at >= _argv.length)          ||
         (typeof _argv[_at] !== 'string') ||
         !_argv[_at].startsWith('--')    ||
         (_argv[_at].length === 2) )
    {
        return { took: 0, at: _at, result: null };
    }

    let body  = _argv[_at].slice(2);
    let value = 'true';
    let i     = _at;

    // "--set NAME=VALUE" takes the next argument, which must have a value
    if (_argv[i] === '--set')
    {
        if ( (i + 1 >= _argv.length) ||
             !_argv[i + 1].includes('=') )
        {
            return { took: -1, at: i, result: refusal };
        }

        body = _argv[++i];
    }

    const equals = body.indexOf('=');

    if (equals >= 0)
    {
        value = body.slice(equals + 1);
    }
    else if (body.startsWith('no-'))
    {
        body  = body.slice(3);
        value = 'false';
    }

    const name = (equals >= 0) ? body.slice(0, equals) : body;

    if ( (equals < 0) &&
         (isBool(_registry, name) === 0) )
    {
        return { took: -1, at: i, result: refusal };
    }

    const result = assignInner(_registry, name, value,
                               optionEnv.SOURCE.COMMAND_LINE);

    return { took: result.isOk ? 1 : -1, at: i, result: result };
}

// 2.3
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
export function takeOption(
    _registry,
    _argv,
    _at
)
{
    return takeOptionInner(_registry,
                           Array.isArray(_argv)
                               ? _argv.map((_argument) =>
                                     ((typeof _argument === 'string')
                                          ? envInner.cstr(_argument)
                                          : _argument))
                               : _argv,
                           _at);
}

function nearest(
    _registry,
    _text
)
{
    const limit = (_text.length <= 3) ? 1 : 2;
    let   best  = null;
    let   most  = limit + 1;

    for (const djin of _registry.djins)
    {
        const far = envInner.distance(djin.name, _text);

        if (far < most)
        {
            best = djin;
            most = far;
        }
    }

    return best;
}

/*
within
  The name a mistyped one was meant to be, within one frame, whole: its
scope kept or replaced, then its variable; null for none near.
*/
function within(
    _frame,
    _name
)
{
    const near = envInner.suggest(_frame, _name);
    const dot  = _name.indexOf('.');

    if (near === null)
    {
        return null;
    }

    // a scope that fails is replaced, and the variable after it kept
    if ( (dot >= 0) &&
         !envInner.findScope(_frame, _name.slice(0, dot)).isOk )
    {
        return near + _name.slice(dot);
    }

    return ((dot >= 0) ? _name.slice(0, dot + 1) : '') + near;
}

function suggestInner(
    _registry,
    _name
)
{
    if ( !isRegistry(_registry) ||
         (_name === null) )
    {
        return '';
    }

    const dot  = _name.indexOf('.');
    const head = (dot >= 0) ? _name.slice(0, dot) : '';
    let   djin = (dot >= 0) ? findInner(_registry, head) : null;

    if ( (dot >= 0)      &&
         (djin === null) &&
         !envInner.findScope(_registry.frame, head).isOk )
    {
        djin = nearest(_registry, head);
    }

    if (djin !== null)
    {
        const rest = _name.slice(dot + 1);

        // the rest may be right already, when only the djin was wrong
        if (envInner.resolve(djin, rest).isOk)
        {
            return djin.name + '.' + rest;
        }

        const near = within(djin, rest);

        return (near !== null) ? (djin.name + '.' + near) : '';
    }

    return within(_registry.frame, _name) ?? '';
}

// 2.4
/**
 * The full name a mistyped one was probably meant to be: its djin
 * corrected, or its scope, or its variable.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string}              _name      the full name as written.
 * @returns {string} the full name; empty where none is near.
 */
export function suggest(
    _registry,
    _name
)
{
    return suggestInner(_registry,
                               (typeof _name === 'string') ? _name
                                                           : null);
}


//==============================================================================
// 3.  INNER
//==============================================================================

// 3.1
/**
 * The registry without its checks, for the modules that stand on it.
 */
export const inner = Object.freeze({
    find:       findInner,
    target:     targetInner,
    assign:     assignInner,
    put:        putInner,
    load:       loadInner,
    import:     importInner,
    takeOption: takeOptionInner,
    suggest:    suggestInner
});
