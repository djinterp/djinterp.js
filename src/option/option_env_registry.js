/*******************************************************************************
* djinterp.js [option]                                    option_env_registry.js
*
*   A program's settings in one place: a root frame for what is the
* program's own, and under it one frame a djin, each named. A setting is
* reached by its full name, "djin.name" or "djin.scope.name", and a name
* with no djin before it is the root's. The registry routes a statement, a
* script, the environment and a command line's options to the frame each
* names, and suggests the full name a mistyped one was meant to be.
*   Like option_env.js, the exported functions take and give strings, and
* `bytes` has the same on byte strings.
*   The reference's registry has room for a fixed number of djins and its
* root for fixed numbers of variables, bindings and bytes of text, each a
* knob (cfg_option_env.h). A registry here has the reference's default
* room unless `init` is given other.
*   reference: inc/djinterp/c/option/option_env_registry.h and
*              src/djinterp/c/option/option_env_registry.c, at d20c0b23
*
*
* path:      /src/option/option_env_registry.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
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
    3.  take_option
    4.  suggest
3.  Bytes
    1.  bytes
*/

import data from '../../generated/option.js';
import { decode, encode } from '../text/utf8.js';
import { STATUS, fail, ok } from './option_common.js';
import * as option_env from './option_env.js';

const PREFIX_ROOM = 256;
const REGISTRY    = Symbol('option_env_registry');
const env_bytes   = option_env.bytes;


//==============================================================================
// 1.  THE REGISTRY
//==============================================================================

/**
 * A registry. Made by `init`; read through the functions here.
 *
 * @typedef {object} option_env_registry
 */

let program = null;

function is_registry(
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
 * @param {number}  [_room.text]      the root's bytes of text.
 * @param {number}  [_room.djins]     the djins.
 * @returns {option_result & {registry: option_env_registry}} the
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
        frame:      option_env.init({
            bindings: _room.bindings ?? data.registry.bindings,
            vars:     _room.vars ?? data.registry.variables,
            text:     _room.text ?? data.registry.text
        }),
        djins:      [],
        capacity:   _room.djins ?? data.registry.djins
    };

    return { ...option_env.set_name(registry.frame, _name),
             registry: registry };
}

// 1.1
/**
 * The program's registry: one for the module, its root named "djinterp",
 * as the reference's is.
 *
 * @returns {option_env_registry}
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
 * @param {?option_env_registry} _registry  the registry.
 * @returns {?option_env} the frame; null for no registry.
 */
export function frame(
    _registry
)
{
    return is_registry(_registry) ? _registry.frame : null;
}

function find_bytes(
    _registry,
    _name
)
{
    if ( !is_registry(_registry) ||
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
 * are dropped, as `option_env.set_parent` drops them.
 *
 * @param {option_env_registry} _registry  the registry.
 * @param {option_env}          _djin      the frame; one with a name.
 * @returns {option_result} its place; INVALID_ARGUMENT for a frame with
 *          no name, or the root itself; KEY_DUPLICATE for a name a djin
 *          has; CAPACITY for a registry that is full.
 */
export function add(
    _registry,
    _djin
)
{
    if ( !is_registry(_registry)   ||
         (_djin === null)          ||
         (_djin === undefined)     ||
         (_djin.name === null)     ||
         (_djin.name === undefined) ||
         (_djin === _registry.frame) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if (find_bytes(_registry, _djin.name) !== null)
    {
        return fail(STATUS.KEY_DUPLICATE);
    }

    if (_registry.djins.length >= _registry.capacity)
    {
        return fail(STATUS.CAPACITY);
    }

    const attached = option_env.set_parent(_djin, _registry.frame);

    if (!attached.is_ok)
    {
        return attached;
    }

    _registry.djins.push(_djin);

    return ok(_registry.djins.length - 1);
}

/**
 * Takes a djin's frame out of the registry and from under the root.
 *
 * @param {option_env_registry} _registry  the registry.
 * @param {option_env}          _djin      the frame.
 * @returns {option_result} the place it had; KEY_ABSENT for a frame that
 *          is not listed.
 */
export function remove(
    _registry,
    _djin
)
{
    if ( !is_registry(_registry) ||
         (_djin === null)        ||
         (_djin === undefined) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const index = _registry.djins.indexOf(_djin);

    if (index < 0)
    {
        return fail(STATUS.KEY_ABSENT);
    }

    option_env.detach(_djin);
    _registry.djins.splice(index, 1);

    return ok(index);
}

// 1.5
/**
 * How many djins a registry lists.
 *
 * @param {?option_env_registry} _registry  the registry.
 * @returns {number}
 */
export function count(
    _registry
)
{
    return is_registry(_registry) ? _registry.djins.length : 0;
}

/**
 * The djin at a place, in the order they were added.
 *
 * @param {?option_env_registry} _registry  the registry.
 * @param {number}               _index     the place, from 0.
 * @returns {?option_env} the frame; null past the last.
 */
export function at(
    _registry,
    _index
)
{
    return ( is_registry(_registry) &&
             (_index >= 0)          &&
             (_index < _registry.djins.length) ) ? _registry.djins[_index]
                                                 : null;
}

/**
 * The djin of a name.
 *
 * @param {?option_env_registry} _registry  the registry.
 * @param {string}               _name      the name.
 * @returns {?option_env} the frame; null for no such djin.
 */
export function find(
    _registry,
    _name
)
{
    return find_bytes(_registry, (typeof _name === 'string') ? encode(_name)
                                                             : null);
}

function target_bytes(
    _registry,
    _name
)
{
    if ( !is_registry(_registry) ||
         (_name === null) )
    {
        return null;
    }

    const dot = _name.indexOf('.');

    if (dot >= 0)
    {
        const djin = find_bytes(_registry, _name.slice(0, dot));

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
 * @param {?option_env_registry} _registry  the registry.
 * @param {string}               _name      the full name.
 * @returns {?option_env} the frame; null for no registry.
 */
export function target(
    _registry,
    _name
)
{
    return target_bytes(_registry, (typeof _name === 'string')
                                       ? encode(_name)
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

    return target_bytes(_registry, _text.slice(start, i));
}

function assign_bytes(
    _registry,
    _name,
    _value,
    _source
)
{
    const frame_ = target_bytes(_registry, _name);

    if (frame_ === null)
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return env_bytes.assign_from(frame_, _name, _value, _source);
}

// 2.1
/**
 * Binds a setting by its full name from a value's text, from a source: as
 * `option_env.assign_from`, in the frame the name is a setting of.
 *
 * @param {option_env_registry} _registry  the registry.
 * @param {string}              _name      the full name.
 * @param {string}              _value     the value's text.
 * @param {number}              _source    the source; any but DEFAULT.
 * @returns {option_result}
 */
export function assign(
    _registry,
    _name,
    _value,
    _source
)
{
    return assign_bytes(_registry,
                        (typeof _name === 'string') ? encode(_name) : null,
                        (typeof _value === 'string') ? encode(_value) : '',
                        _source);
}

function put_bytes(
    _registry,
    _statement,
    _source
)
{
    if ( !is_registry(_registry) ||
         (_statement === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return env_bytes.put_n_from(route(_registry, _statement), _statement,
                                _source);
}

/**
 * Carries out one statement by full name, from a source: as
 * `option_env.put_from`, in the frame its name is a setting of.
 *
 * @param {option_env_registry} _registry   the registry.
 * @param {string}              _statement  the statement; read up to a
 *        NUL.
 * @param {number}              _source     the source; any but DEFAULT.
 * @returns {option_result}
 */
export function put(
    _registry,
    _statement,
    _source
)
{
    return put_bytes(_registry,
                     (typeof _statement === 'string')
                         ? env_bytes.cstr(encode(_statement))
                         : null,
                     _source);
}

function load_bytes(
    _registry,
    _script,
    _source
)
{
    let i      = 0;
    let loaded = 0;

    if ( !is_registry(_registry) ||
         (_script === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const size = _script.length;

    while (i < size)
    {
        const start = i;

        i = env_bytes.statement_end(_script, i);

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
            const result = env_bytes.put_n_from(route(_registry, text), text,
                                                _source);

            if (!result.is_ok)
            {
                return { ...result, error_offset: first };
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
 * `option_env.load_from`, each statement in the frame its name is a
 * setting of. It stops at the first statement refused.
 *
 * @param {option_env_registry} _registry  the registry.
 * @param {string}              _script    the script; read up to a NUL.
 * @param {number}              _source    the source; any but DEFAULT.
 * @returns {option_result & {error_offset?: number}} how many statements
 *          were carried out; or the refusal, with in `error_offset` where
 *          the refused statement starts, in bytes of the script's UTF-8.
 */
export function load(
    _registry,
    _script,
    _source
)
{
    return load_bytes(_registry,
                      (typeof _script === 'string')
                          ? env_bytes.cstr(encode(_script))
                          : null,
                      _source);
}

function import_bytes(
    _registry,
    _prefix,
    _lookup
)
{
    if (!is_registry(_registry))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    let result  = env_bytes.import(_registry.frame, _prefix, _lookup);
    let total   = result.is_ok ? result.value : 0;
    let failure = result.is_ok ? ok(0) : result;

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

        result = env_bytes.import(djin, prefix + '_', _lookup);
        total += result.is_ok ? result.value : 0;

        if ( !result.is_ok &&
             failure.is_ok )
        {
            failure = result;
        }
    }

    return failure.is_ok ? ok(total) : failure;
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
 * @param {option_env_registry} _registry  the registry.
 * @param {?string}             _prefix    what each name follows, or
 *        null for nothing.
 * @param {Map<string, string>|Record<string, string>|
 *         function(string): (string|undefined)} _environment  the
 *        environment: names to values.
 * @returns {option_result} how many were bound; or the first refusal.
 */
export function import_(
    _registry,
    _prefix,
    _environment
)
{
    return import_bytes(_registry,
                        (typeof _prefix === 'string')
                            ? env_bytes.cstr(encode(_prefix))
                            : '',
                        env_bytes.lookup_of(_environment));
}

export { import_ as import };

/*
is_bool
  1 where a full name is a BOOL's, 0 where another kind's, -1 where none's.
*/
function is_bool(
    _registry,
    _name
)
{
    const frame_ = target_bytes(_registry, _name);

    if (frame_ === null)
    {
        return -1;
    }

    const found = env_bytes.resolve(frame_, _name);

    if (!found.is_ok)
    {
        return -1;
    }

    const value = env_bytes.get(frame_, found.scope, found.value);

    if (!value.is_ok)
    {
        return -1;
    }

    return (value.got.kind === option_env.KIND.BOOL) ? 1 : 0;
}

function take_option_bytes(
    _registry,
    _argv,
    _at
)
{
    const refusal = fail(STATUS.INVALID_ARGUMENT);

    if ( !is_registry(_registry)         ||
         !Array.isArray(_argv)           ||
         !Number.isInteger(_at)          ||
         (_at < 0)                       ||
         (_at >= _argv.length)           ||
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
         (is_bool(_registry, name) === 0) )
    {
        return { took: -1, at: i, result: refusal };
    }

    const result = assign_bytes(_registry, name, value,
                                option_env.SOURCE.COMMAND_LINE);

    return { took: result.is_ok ? 1 : -1, at: i, result: result };
}

// 2.3
/**
 * Takes one option of a command line as a setting, from the command line:
 * "--set NAME=VALUE", "--NAME=VALUE", "--NAME" for a BOOL made true and
 * "--no-NAME" for one made false.
 *
 * @param {option_env_registry} _registry  the registry.
 * @param {Array<string>}       _argv      the command line's arguments.
 * @param {number}              _at        which one to look at.
 * @returns {{took: number, at: number, result: ?option_result}}
 *          `took` is 1 for a setting bound, 0 for an argument that is no
 *          option of this form, with no result, and -1 for one that is
 *          and is refused, with why in `result`. `at` is the last argument used: `_at`,
 *          or the one after it for "--set".
 */
export function take_option(
    _registry,
    _argv,
    _at
)
{
    return take_option_bytes(_registry,
                             Array.isArray(_argv)
                                 ? _argv.map((_argument) =>
                                       ((typeof _argument === 'string')
                                            ? env_bytes.cstr(encode(_argument))
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
        const far = env_bytes.distance(djin.name, _text);

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
    const near = env_bytes.suggest(_frame, _name);
    const dot  = _name.indexOf('.');

    if (near === null)
    {
        return null;
    }

    // a scope that fails is replaced, and the variable after it kept
    if ( (dot >= 0) &&
         !env_bytes.find_scope(_frame, _name.slice(0, dot)).is_ok )
    {
        return near + _name.slice(dot);
    }

    return ((dot >= 0) ? _name.slice(0, dot + 1) : '') + near;
}

function suggest_bytes(
    _registry,
    _name
)
{
    if ( !is_registry(_registry) ||
         (_name === null) )
    {
        return '';
    }

    const dot  = _name.indexOf('.');
    const head = (dot >= 0) ? _name.slice(0, dot) : '';
    let   djin = (dot >= 0) ? find_bytes(_registry, head) : null;

    if ( (dot >= 0)      &&
         (djin === null) &&
         !env_bytes.find_scope(_registry.frame, head).is_ok )
    {
        djin = nearest(_registry, head);
    }

    if (djin !== null)
    {
        const rest = _name.slice(dot + 1);

        // the rest may be right already, when only the djin was wrong
        if (env_bytes.resolve(djin, rest).is_ok)
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
 * @param {option_env_registry} _registry  the registry.
 * @param {string}              _name      the full name as written.
 * @returns {string} the full name; empty where none is near.
 */
export function suggest(
    _registry,
    _name
)
{
    return decode(suggest_bytes(_registry,
                                (typeof _name === 'string') ? encode(_name)
                                                            : null));
}


//==============================================================================
// 3.  BYTES
//==============================================================================

// 3.1
/**
 * The registry on byte strings, for the modules that count bytes
 * themselves.
 */
export const bytes = Object.freeze({
    find:        find_bytes,
    target:      target_bytes,
    assign:      assign_bytes,
    put:         put_bytes,
    load:        load_bytes,
    import:      import_bytes,
    take_option: take_option_bytes,
    suggest:     suggest_bytes
});
