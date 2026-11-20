/*******************************************************************************
* djinterp.js [option]                                             option_env.js
*
*   The option machine: frames of declared variables, the bindings of each
* by scope and by source, and the value in force. A variable is a ROW: a
* name, a kind, a default, and what it accepts. A binding names who set it
* -- the program, a file, the environment, the command line, an override --
* and the value in force is the binding of the highest source, then of the
* deepest frame, then the scoped one over the global one; with no binding,
* the row's default. A value is refused as the reference refuses it, with
* the reference's status: out of range, not a name, a name not built, a
* source the row refuses.
*   Statements ("name = value", "name", "-name") and scripts of them are
* read as the reference reads them, and a script stops at its first
* refusal and says where.
*
*   This file follows option_env.c function by function, in its order, so
* that either can be read against the other. Three things differ, each
* because the language does:
*   - TEXT IS A STRING, COUNTED IN ITS UTF-16 UNITS (the owner's ruling 3
*     of 2026-11-16). Where the reference's lengths, offsets, limits and
*     room count bytes, the port's count code units, so the two agree
*     for ASCII and differ for any other text: "é" is one here and two
*     bytes there. The transcripts are replayed with each of the
*     reference's bytes as one unit, which holds the port to it on
*     everything but that count. The functions under `inner` are the
*     same machine without the checks of what a caller hands in, for the
*     modules that stand on this one.
*   - INTEGERS ARE EXACT. A row's integers are held as BigInt. A value is
*     handed out as a number where every value the row can hold lies
*     within the exact integers of a double, and as a bigint where one
*     does not (docs/JS_STYLE.md, section 5.2).
*   - ROOM IS OPTIONAL. The reference's frame is given its storage and can
*     be full. A frame here has no limit unless `init` is given one; given
*     the reference's sizes it reports CAPACITY and BUFFER_TOO_SMALL where
*     the reference does, and its generation moves when its text is
*     compacted, as the reference's does. VALUE_CAPACITY is not modelled:
*     with the room D_OPTION_ENV_DECLARE gives, the reference cannot
*     report it.
*   reference: inc/djinterp/c/option/option_env.h and
*              src/djinterp/c/option/option_env.c, at dfc793c4
*
*
* path:      /src/option/option_env.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  Vocabulary
    1.  KIND, SOURCE, SOURCES, GLOBAL, NONE, DEPTH_MAX
    2.  refuses, idDepth, idIndex
    3.  kindName, sourceName
    4.  rowBool ... rowFlags
2.  Setting up
    1.  init
    2.  declare, declareAll
    3.  setScopes, setParent, setName
    4.  clear, detach, generation, root, name
3.  Finding
    1.  varCount, varId, varIndex, varAt, varFrame
    2.  scopeName, find, findScope, resolve
    3.  distance, suggest
4.  Reading
    1.  get, bool, int, real, text, source
    2.  isBound, scopeIsBound, layers
5.  Binding by value
    1.  setBool, setInt, setReal, setText, setValue, setTextCopy
    2.  unset, unsetFrom, unsetSource
6.  Binding from text
    1.  assignFrom, assign
    2.  putFrom, put, putNFrom
    3.  statementEnd, loadFrom, load
    4.  import
7.  Writing text
    1.  format, formatQuoted
8.  Reading on a hot path
    1.  cached
9.  Inner
    1.  inner
*/

import data from '../../generated/option.js';
import { formatReal } from '../text/real_format.js';
import { readReal } from '../text/real_read.js';
import { STATUS, fail, ok } from './option_common.js';

// the types of other modules that this one's comments name
/** @import { OptionResult } from './option_common.js' */


//==============================================================================
// 1.  VOCABULARY
//==============================================================================

// 1.1
/**
 * The kinds of variable, by the reference's values.
 */
export const KIND = Object.freeze({
    BOOL: 1, INT: 2, REAL: 3, TEXT: 4, CHOICE: 5, FLAGS: 6
});

/**
 * The sources of a binding, lowest first. DEFAULT is a row's own default
 * and binds nothing.
 */
export const SOURCE = Object.freeze({
    DEFAULT: 0, PROGRAM: 1, FILE: 2, ENVIRONMENT: 3, COMMAND_LINE: 4,
    OVERRIDE: 5
});

/** How many sources there are. */
export const SOURCES = 6;

/** The scope that is none: a binding for every scope. */
export const GLOBAL = 0;

/** No variable: what `varId` gives past the last. */
export const NONE = 0xFFFFFFFF;

/** The deepest a frame may be. */
export const DEPTH_MAX = data.depth_max;

const DEPTH_SHIFT = 20;
const LOCAL       = 0x000FFFFF;
const ID          = 0x0FFFFFFF;
const SCRATCH     = 256;
const NAME_MAX    = 63;
const INT64_MIN   = -(1n << 63n);
const INT64_MAX   = (1n << 63n) - 1n;
const UINT64_MAX  = (1n << 64n) - 1n;
const SAFE        = BigInt(Number.MAX_SAFE_INTEGER);

// 1.2
/**
 * The bit of a row's `refused` for a source.
 *
 * @param {number} _source  the source.
 * @returns {number} the bit.
 */
export function refuses(
    _source
)
{
    return (1 << _source) >>> 0;
}

/**
 * The depth of the frame an id belongs to.
 *
 * @param {number} _id  a variable's or a scope's id.
 * @returns {number} the depth.
 */
export function idDepth(
    _id
)
{
    return (_id >>> DEPTH_SHIFT) & 0xFF;
}

/**
 * An id's place among its frame's own variables, or scopes from 1.
 *
 * @param {number} _id  a variable's or a scope's id.
 * @returns {number} the place.
 */
export function idIndex(
    _id
)
{
    return _id & LOCAL;
}

// 1.3
/**
 * A kind's name; "unknown" for a value that is none.
 *
 * @param {number} _kind  the kind.
 * @returns {string} the name.
 */
export function kindName(
    _kind
)
{
    return ( (_kind < KIND.BOOL) ||
             (_kind > KIND.FLAGS) ||
             !Number.isInteger(_kind) ) ? data.kinds[0] : data.kinds[_kind];
}

/**
 * A source's name; "unknown" for a value that is none.
 *
 * @param {number} _source  the source.
 * @returns {string} the name.
 */
export function sourceName(
    _source
)
{
    return ( (_source < SOURCE.DEFAULT) ||
             (_source >= SOURCES)       ||
             !Number.isInteger(_source) ) ? data.source_unknown
                                          : data.sources[_source];
}

/**
 * A row: what a frame declares a variable from. The reference's struct
 * dj_option_env_var, member for member; a member left out is the
 * reference's zero, but `minimum` and `maximum`, which are the least and
 * the greatest 64-bit integers.
 *
 * @typedef {object} OptionRow
 * @property {string}  name     an identifier.
 * @property {number}  kind     one of KIND.
 * @property {?string} [help]   a line about it.
 * @property {?string} [alias]  a second name, an identifier.
 * @property {?string} [knob]   the compile-time knob its default is.
 * @property {?Array<{name: string, value: (number|bigint|string)}>}
 *           [names]    its named values.
 * @property {?Array<{name: string, value: (number|bigint|string)}>}
 *           [unbuilt]  named values that are ruled and not built.
 * @property {?string} [text]   a TEXT's default.
 * @property {number|bigint|string} [integer]  the default of every other
 *           kind but REAL; a string is a decimal integer.
 * @property {number|bigint|string} [minimum]  an INT's least value.
 * @property {number|bigint|string} [maximum]  an INT's greatest value.
 * @property {number|string} [real]  a REAL's default.
 * @property {number}  [refused]  the sources it refuses, by `refuses`.
 */

// 1.4
/**
 * A bool row: D_OPTION_ENV_BOOL.
 *
 * @param {string}  _name     its name.
 * @param {boolean|number} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowBool(
    _name,
    _default,
    _help = null
)
{
    return { kind: KIND.BOOL, name: _name, integer: _default ? 1 : 0,
             help: _help };
}

/**
 * An int row that accepts any 64-bit value: D_OPTION_ENV_INT. Its values
 * are bigints.
 *
 * @param {string}  _name     its name.
 * @param {number|bigint} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowInt(
    _name,
    _default,
    _help = null
)
{
    return { kind: KIND.INT, name: _name, integer: _default, help: _help };
}

/**
 * An int row that accepts [minimum, maximum] only: D_OPTION_ENV_INT_RANGE.
 *
 * @param {string}  _name     its name.
 * @param {number|bigint} _default  its default.
 * @param {number|bigint} _minimum  its least value.
 * @param {number|bigint} _maximum  its greatest value.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowIntRange(
    _name,
    _default,
    _minimum,
    _maximum,
    _help = null
)
{
    return { kind: KIND.INT, name: _name, integer: _default,
             minimum: _minimum, maximum: _maximum, help: _help };
}

/**
 * A real row: D_OPTION_ENV_REAL.
 *
 * @param {string}  _name     its name.
 * @param {number}  _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowReal(
    _name,
    _default,
    _help = null
)
{
    return { kind: KIND.REAL, name: _name, real: _default, help: _help };
}

/**
 * A text row; its default may be null: D_OPTION_ENV_TEXT.
 *
 * @param {string}  _name     its name.
 * @param {?string} _default  its default.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowText(
    _name,
    _default,
    _help = null
)
{
    return { kind: KIND.TEXT, name: _name, text: _default, help: _help };
}

/**
 * A choice row over named values: D_OPTION_ENV_CHOICE.
 *
 * @param {string}  _name     its name.
 * @param {Array<{name: string, value: (number|bigint)}>} _names  its
 *        values.
 * @param {number|bigint} _default  its default, one of them.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowChoice(
    _name,
    _names,
    _default,
    _help = null
)
{
    return { kind: KIND.CHOICE, name: _name, names: _names,
             integer: _default, help: _help };
}

/**
 * A flags row over named bits: D_OPTION_ENV_FLAGS.
 *
 * @param {string}  _name     its name.
 * @param {Array<{name: string, value: (number|bigint)}>} _names  its
 *        bits.
 * @param {number|bigint} _default  its default, of those bits.
 * @param {?string} [_help]   a line about it.
 * @returns {OptionRow}
 */
export function rowFlags(
    _name,
    _names,
    _default,
    _help = null
)
{
    return { kind: KIND.FLAGS, name: _name, names: _names,
             integer: _default, help: _help };
}


//==============================================================================
// SMALL THINGS
//==============================================================================

/*
cstr
  A string as C reads one handed to it without a length: up to its
first NUL.
*/
function cstr(
    _text
)
{
    const nul = _text.indexOf('\0');

    return (nul < 0) ? _text : _text.slice(0, nul);
}

/*
toInner
  A caller's string, checked to be one; null for null or undefined.
*/
function toInner(
    _text,
    _what
)
{
    if ( (_text === null) ||
         (_text === undefined) )
    {
        return null;
    }

    if (typeof _text !== 'string')
    {
        throw new TypeError('optionEnv: ' + _what + ' is not a string');
    }

    return _text;
}

/*
toInt64
  A caller's integer as a BigInt: a bigint, a whole number, or a decimal
string as generated JSON carries one.
*/
function toInt64(
    _value,
    _what
)
{
    let value;

    if (typeof _value === 'bigint')
    {
        value = _value;
    }
    else if ( (typeof _value === 'number') &&
              Number.isSafeInteger(_value) )
    {
        value = BigInt(_value);
    }
    else if ( (typeof _value === 'string') &&
              /^-?[0-9]+$/.test(_value) )
    {
        value = BigInt(_value);
    }
    else if (typeof _value === 'boolean')
    {
        value = _value ? 1n : 0n;
    }
    else
    {
        throw new TypeError('optionEnv: ' + _what +
                            ' is not an exact integer');
    }

    if ( (value < INT64_MIN) ||
         (value > INT64_MAX) )
    {
        throw new RangeError('optionEnv: ' + _what +
                             ' is not a 64-bit integer');
    }

    return value;
}

function lower(
    _c
)
{
    return ( (_c >= 'A') &&
             (_c <= 'Z') ) ? String.fromCharCode(_c.charCodeAt(0) + 32) : _c;
}

function isSpace(
    _c
)
{
    return ( (_c === ' ')  ||
             (_c === '\t') ||
             (_c === '\r') ||
             (_c === '\n') ||
             (_c === '\f') ||
             (_c === '\v') );
}

function isNameChar(
    _c
)
{
    return ( (_c !== undefined) &&
             ( ((_c >= 'a') && (_c <= 'z')) ||
               ((_c >= 'A') && (_c <= 'Z')) ||
               ((_c >= '0') && (_c <= '9')) ||
               (_c === '_') ) );
}

function isIdentifier(
    _text
)
{
    if ( (_text === null)    ||
         (_text.length === 0) ||
         ( (_text[0] >= '0') &&
           (_text[0] <= '9') ) )
    {
        return false;
    }

    for (let i = 0; i < _text.length; ++i)
    {
        if (!isNameChar(_text[i]))
        {
            return false;
        }
    }

    return true;
}

/*
equal
  Whether a name is a text, wholly; folded, without regard to ASCII case.
*/
function equal(
    _name,
    _text,
    _folded
)
{
    if ( (_name === null) ||
         (_name.length !== _text.length) )
    {
        return false;
    }

    if (!_folded)
    {
        return (_name === _text);
    }

    for (let i = 0; i < _text.length; ++i)
    {
        if (lower(_name[i]) !== lower(_text[i]))
        {
            return false;
        }
    }

    return true;
}

function trim(
    _text
)
{
    let start = 0;
    let end   = _text.length;

    while ( (start < end) &&
            isSpace(_text[start]) )
    {
        ++start;
    }

    while ( (end > start) &&
            isSpace(_text[end - 1]) )
    {
        --end;
    }

    return { text: _text.slice(start, end), start: start };
}

function atDepth(
    _env,
    _depth
)
{
    if (_depth > _env.depth)
    {
        return null;
    }

    for (let up = _env.depth - _depth; up > 0; --up)
    {
        _env = _env.parent;
    }

    return _env;
}

/*
declOf
  The declaration of a variable's id, as a frame sees it; null for an id it
does not see.
*/
function declOf(
    _env,
    _var
)
{
    if ( !Number.isInteger(_var) ||
         (_var < 0)              ||
         (_var > ID) )
    {
        return null;
    }

    const frame = atDepth(_env, _var >>> DEPTH_SHIFT);
    const index = _var & LOCAL;

    return ( (frame !== null) &&
             (index < frame.vars.length) ) ? frame.vars[index] : null;
}

function scopeOk(
    _env,
    _scope
)
{
    if (_scope === GLOBAL)
    {
        return true;
    }

    if ( !Number.isInteger(_scope) ||
         (_scope < 0)              ||
         (_scope > 0xFFFFFFFF) )
    {
        return false;
    }

    const frame = atDepth(_env, _scope >>> DEPTH_SHIFT);
    const index = _scope & LOCAL;

    return ( (frame !== null)                         &&
             (index >= 1)                             &&
             (index <= frame.scopes.length)           &&
             ((_scope >>> DEPTH_SHIFT) <= DEPTH_MAX) );
}

/*
check
  The status of naming a variable in a scope, and its declaration.
*/
function check(
    _env,
    _scope,
    _var
)
{
    if (!isEnv(_env))
    {
        return { status: STATUS.INVALID_ARGUMENT, decl: null };
    }

    const decl = declOf(_env, _var);

    if ( (decl === null) ||
         !scopeOk(_env, _scope) )
    {
        return { status: STATUS.KEY_ABSENT, decl: null };
    }

    return { status: STATUS.OK, decl: decl };
}

function sourceOk(
    _source
)
{
    return ( Number.isInteger(_source)   &&
             (_source > SOURCE.DEFAULT)  &&
             (_source < SOURCES) );
}

const ENV_MARK = Symbol('option_env');

function isEnv(
    _env
)
{
    return ( (_env !== null)            &&
             (typeof _env === 'object') &&
             (_env[ENV_MARK] === true) );
}

function makeId(
    _depth,
    _index
)
{
    return ((_depth << DEPTH_SHIFT) | _index) >>> 0;
}

function cellKey(
    _scope,
    _source,
    _var
)
{
    return _scope + '/' + _source + '/' + _var;
}


//==============================================================================
// THE TEXT ARENA
//==============================================================================
//   The reference copies a text it must keep into a block of the frame's,
// and packs the block when it is full. Here a kept text is an object with
// `arena` set, counted by its length and its terminator; what the count
// would be decides BUFFER_TOO_SMALL and when the generation moves.

/*
compactText
  The count of the texts still bound, each once; the generation moves.
*/
function compactText(
    _env
)
{
    const live = new Set();
    let   mark = 0;

    for (const cell of _env.cells.values())
    {
        if ( (cell.text !== null)      &&
             (cell.text !== undefined) &&
             cell.text.arena           &&
             !live.has(cell.text) )
        {
            live.add(cell.text);
            mark += cell.text.chars.length + 1;
        }
    }

    _env.textUsed = mark;
    ++_env.generation;

    return;
}

/*
alloc
  Room for a text of a size and its terminator; false where the frame has
none even once packed.
*/
function alloc(
    _env,
    _size
)
{
    if (_env.textCapacity - _env.textUsed <= _size)
    {
        compactText(_env);

        if (_env.textCapacity - _env.textUsed <= _size)
        {
            return false;
        }
    }

    _env.textUsed += _size + 1;

    return true;
}


//==============================================================================
// 2.  SETTING UP
//==============================================================================

/**
 * A frame. Made by `init`; its members are the machine's own, and are read
 * through the functions here.
 *
 * @typedef {object} OptionEnv
 */

// 2.1
/**
 * A frame with no variables, scopes, bindings, parent or name.
 *
 * The reference's frame is given its storage; this one is given at most
 * its sizes, and has no limit where it is given none.
 *
 * @param {object} [_room]  how much the frame holds.
 * @param {number} [_room.bindings=Infinity]  bindings.
 * @param {number} [_room.vars=Infinity]      variables it declares.
 * @param {number} [_room.text=Infinity]      units of text it keeps
 *        copies of, each with a terminator, as the reference counts them.
 * @returns {OptionEnv} the frame.
 */
export function init(
    _room = {}
)
{
    const count = (_value, _what) =>
    {
        if ( (_value !== undefined)                    &&
             (_value !== Infinity)                     &&
             ( !Number.isInteger(_value) ||
               (_value < 0) ) )
        {
            throw new TypeError('optionEnv.init: ' + _what +
                                ' is not a count');
        }

        return (_value === undefined) ? Infinity : _value;
    };

    return {
        [ENV_MARK]:      true,
        parent:          null,
        vars:            [],
        scopes:          [],
        name:            null,
        cells:           new Map(),
        bindingCapacity: count(_room.bindings, 'bindings'),
        varCapacity:     Math.min(count(_room.vars, 'vars'), LOCAL),
        textCapacity:    count(_room.text, 'text'),
        textUsed:        0,
        generation:      0,
        depth:           0,
        childCount:      0
    };
}

/*
normalNames
  A row's named values as the machine holds them: null for none given.
*/
function normalNames(
    _names,
    _count,
    _what
)
{
    if ( (_names === null) ||
         (_names === undefined) )
    {
        return null;
    }

    if (!Array.isArray(_names))
    {
        throw new TypeError('optionEnv.declare: ' + _what +
                            ' is not an array');
    }

    const count = (_count === undefined) ? _names.length
                                         : Math.min(_count, _names.length);

    return _names.slice(0, count).map((_name) => ({
        name:  toInner(_name.name, 'a named value\'s name'),
        value: toInt64(_name.value, 'a named value')
    }));
}

/*
normalize
  A caller's row as the machine holds it: text checked, integers as
BigInt, and every member the reference's struct has.
*/
function normalize(
    _row
)
{
    if ( (_row === null) ||
         (typeof _row !== 'object') )
    {
        throw new TypeError('optionEnv.declare: the row is not an object');
    }

    const names   = normalNames(_row.names, _row.name_count, 'names');
    const unbuilt = normalNames(_row.unbuilt, _row.unbuilt_count,
                                'unbuilt');
    let   real    = 0;

    if (typeof _row.real_bits === 'string')
    {
        // generated data: the double's own bits
        const view = new DataView(new ArrayBuffer(8));

        view.setBigUint64(0, BigInt('0x' + _row.real_bits));
        real = view.getFloat64(0);
    }
    else if (typeof _row.real === 'string')
    {
        const read = readReal(_row.real);

        if (read.length !== _row.real.length)
        {
            throw new TypeError('optionEnv.declare: real is not a real');
        }

        real = read.value;
    }
    else if (typeof _row.real === 'number')
    {
        real = _row.real;
    }
    else if (_row.real !== undefined)
    {
        throw new TypeError('optionEnv.declare: real is not a number');
    }

    return {
        row:           _row,
        name:          toInner(_row.name, 'name'),
        help:          toInner(_row.help, 'help'),
        alias:         toInner(_row.alias, 'alias'),
        knob:          toInner(_row.knob, 'knob'),
        names:         names,
        unbuilt:       unbuilt,
        text:          toInner(_row.text, 'text'),
        integer:       toInt64(_row.integer ?? 0, 'integer'),
        minimum:       toInt64(_row.minimum ?? INT64_MIN, 'minimum'),
        maximum:       toInt64(_row.maximum ?? INT64_MAX, 'maximum'),
        real:          real,
        name_count:    (names !== null) ? names.length
                                        : (_row.name_count ?? 0),
        unbuilt_count: (unbuilt !== null) ? unbuilt.length
                                          : (_row.unbuilt_count ?? 0),
        kind:          _row.kind,
        refused:       (_row.refused ?? 0) >>> 0,
        exact:         false
    };
}

/*
isExact
  Whether every integer a row can hold lies within the exact integers of a
double: whether its values are handed out as numbers.
*/
function isExact(
    _decl
)
{
    const safe  = (_value) => ( (_value >= -SAFE) &&
                                (_value <= SAFE) );
    const named = (_decl.names ?? []).every((_name) => safe(_name.value));

    switch (_decl.kind)
    {
        case KIND.BOOL:
            return true;

        case KIND.INT:
            return ( safe(_decl.minimum) &&
                     safe(_decl.maximum) &&
                     named );

        case KIND.CHOICE:
            return named;

        case KIND.FLAGS:
        {
            let mask = 0n;

            for (const name of (_decl.names ?? []))
            {
                mask |= name.value;
            }

            // a subset of a mask that is not negative is no larger
            return ( (mask >= 0n) &&
                     safe(mask) );
        }

        default:
            return safe(_decl.integer);
    }
}

function isNamed(
    _decl,
    _value
)
{
    for (let i = 0; (_decl.names !== null) && (i < _decl.name_count); ++i)
    {
        if (_decl.names[i].value === _value)
        {
            return true;
        }
    }

    return false;
}

// the sources a row may refuse: every one but DEFAULT
const REFUSABLE = ((refuses(SOURCE.OVERRIDE) << 1) -
                   refuses(SOURCE.PROGRAM)) >>> 0;

function wellFormed(
    _decl
)
{
    if ( !isIdentifier(_decl.name)                    ||
         ( (_decl.alias !== null) &&
           !isIdentifier(_decl.alias) )               ||
         !Number.isInteger(_decl.kind)                ||
         (_decl.kind < KIND.BOOL)                     ||
         (_decl.kind > KIND.FLAGS)                    ||
         ( (_decl.unbuilt === null) &&
           (_decl.unbuilt_count !== 0) )               ||
         ( (_decl.names === null) &&
           (_decl.name_count !== 0) )                  ||
         ((_decl.refused & ~REFUSABLE) !== 0) )
    {
        return false;
    }

    switch (_decl.kind)
    {
        case KIND.BOOL:
            return ( (_decl.integer === 0n) ||
                     (_decl.integer === 1n) );

        case KIND.INT:
            return ( ( (_decl.minimum <= _decl.integer) &&
                       (_decl.integer <= _decl.maximum) ) ||
                     isNamed(_decl, _decl.integer) );

        case KIND.CHOICE:
            return isNamed(_decl, _decl.integer);

        case KIND.FLAGS:
        {
            let mask = 0n;

            for (let i = 0; (_decl.names !== null) &&
                            (i < _decl.name_count); ++i)
            {
                mask |= _decl.names[i].value;
            }

            return ( (_decl.names !== null)   &&
                     (_decl.name_count !== 0) &&
                     ((_decl.integer & ~mask) === 0n) );
        }

        default:
            return true;
    }
}

function declares(
    _env,
    _name
)
{
    for (let i = 0; (_name !== null) && (i < _env.vars.length); ++i)
    {
        if ( equal(_env.vars[i].name, _name, false) ||
             equal(_env.vars[i].alias, _name, false) )
        {
            return true;
        }
    }

    return false;
}

// 2.2
/**
 * Declares a variable in a frame.
 *
 * @param {OptionEnv} _env  the frame.
 * @param {OptionRow} _row  the row; kept, and what `varAt` gives.
 * @returns {OptionResult} the variable's id; INVALID_ARGUMENT for a row
 *          that is not well formed -- a name or alias that is no
 *          identifier, a kind that is none, a default the row itself would
 *          refuse; KEY_DUPLICATE for a name or alias the frame has;
 *          CAPACITY for a frame that is full.
 */
export function declare(
    _env,
    _row
)
{
    if ( !isEnv(_env)      ||
         (_row === null)   ||
         (_row === undefined) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const decl = normalize(_row);

    if (!wellFormed(decl))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if ( declares(_env, decl.name) ||
         declares(_env, decl.alias) )
    {
        return fail(STATUS.KEY_DUPLICATE);
    }

    if (_env.vars.length >= _env.varCapacity)
    {
        return fail(STATUS.CAPACITY);
    }

    decl.exact = isExact(decl);
    _env.vars.push(decl);
    ++_env.generation;

    return ok(makeId(_env.depth, _env.vars.length - 1));
}

/**
 * Declares each row of a table, stopping at the first the frame refuses.
 *
 * @param {OptionEnv}        _env   the frame.
 * @param {Array<OptionRow>} _rows  the rows.
 * @returns {OptionResult} the id of the first, or the refusal.
 */
export function declareAll(
    _env,
    _rows
)
{
    if ( !isEnv(_env) ||
         !Array.isArray(_rows) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const first = makeId(_env.depth, _env.vars.length);

    for (const row of _rows)
    {
        const result = declare(_env, row);

        if (!result.isOk)
        {
            return result;
        }
    }

    return ok(first);
}

// 2.3
/**
 * Names a frame's scopes; they replace any it had.
 *
 * @param {OptionEnv}    _env    the frame.
 * @param {Array<string>} _names  the scopes' names, in order.
 * @returns {OptionResult} the id of the first.
 */
export function setScopes(
    _env,
    _names
)
{
    if ( !isEnv(_env)           ||
         !Array.isArray(_names) ||
         (_names.length > LOCAL) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    _env.scopes = _names.map((_name) => toInner(_name, 'a scope\'s name'));
    ++_env.generation;

    return ok(makeId(_env.depth, 1));
}

/**
 * Puts a frame under a parent, or under none. Its bindings are dropped: a
 * binding's key carries its variable's depth, which this changes.
 *
 * @param {OptionEnv}  _env     the frame; one with no children.
 * @param {?OptionEnv} _parent  the parent, or null.
 * @returns {OptionResult} INVALID_ARGUMENT for a frame with children or
 *          a parent that is the frame or under it; CAPACITY for a parent
 *          at the greatest depth.
 */
export function setParent(
    _env,
    _parent
)
{
    _parent = _parent ?? null;

    if ( !isEnv(_env)           ||
         (_env.childCount !== 0) ||
         ( (_parent !== null) &&
           !isEnv(_parent) ) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    for (let f = _parent; f !== null; f = f.parent)
    {
        if (f === _env)
        {
            return fail(STATUS.INVALID_ARGUMENT);
        }
    }

    if ( (_parent !== null) &&
         (_parent.depth >= DEPTH_MAX) )
    {
        return fail(STATUS.CAPACITY);
    }

    const before = generation(_env);

    if (_env.parent !== null)
    {
        --_env.parent.childCount;
    }

    if (_parent !== null)
    {
        ++_parent.childCount;
    }

    _env.cells.clear();
    _env.textUsed   = 0;
    _env.parent     = _parent;
    _env.depth      = (_parent !== null) ? (_parent.depth + 1) : 0;
    _env.generation = (before + 1) >>> 0;

    return ok(0);
}

/**
 * Names a frame: what qualifies its variables, as in "printer.style".
 *
 * @param {OptionEnv} _env   the frame.
 * @param {?string}    _name  an identifier, or null for no name.
 * @returns {OptionResult}
 */
export function setName(
    _env,
    _name
)
{
    const name = toInner(_name, 'the name');

    if ( !isEnv(_env) ||
         ( (name !== null) &&
           !isIdentifier(name) ) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    _env.name = name;
    ++_env.generation;

    return ok(0);
}

// 2.4
/**
 * Drops every binding of a frame's own.
 *
 * @param {OptionEnv} _env  the frame.
 */
export function clear(
    _env
)
{
    if (isEnv(_env))
    {
        _env.cells.clear();
        _env.textUsed = 0;
        ++_env.generation;
    }

    return;
}

/**
 * Takes a frame from under its parent.
 *
 * @param {OptionEnv} _env  the frame.
 */
export function detach(
    _env
)
{
    if ( isEnv(_env) &&
         (_env.parent !== null) )
    {
        setParent(_env, null);
    }

    return;
}

/**
 * A count that moves whenever what a frame sees may have changed: its own
 * and its ancestors', summed.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {number} the count, of 32 bits.
 */
export function generation(
    _env
)
{
    let total = 0;

    for (let f = isEnv(_env) ? _env : null; f !== null; f = f.parent)
    {
        total = (total + f.generation) >>> 0;
    }

    return total;
}

/**
 * The frame at the top of a frame's chain.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {?OptionEnv} the root; null for no frame.
 */
export function root(
    _env
)
{
    if (!isEnv(_env))
    {
        return null;
    }

    while (_env.parent !== null)
    {
        _env = _env.parent;
    }

    return _env;
}

/**
 * A frame's name. The reference reads the frame's member; a frame here
 * holds its name itself, so this hands it out.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {?string} the name; null for none, and for no frame.
 */
export function name(
    _env
)
{
    return ( isEnv(_env) &&
             (_env.name !== null) ) ? _env.name : null;
}


//==============================================================================
// 3.  FINDING
//==============================================================================

// 3.1
/**
 * How many variables a frame sees: its own and its ancestors'.
 *
 * @param {?OptionEnv} _env  the frame.
 * @returns {number} the count.
 */
export function varCount(
    _env
)
{
    let count = 0;

    for (let f = isEnv(_env) ? _env : null; f !== null; f = f.parent)
    {
        count += f.vars.length;
    }

    return count;
}

/**
 * The id of the variable at a place among those a frame sees, the root's
 * first.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _index  the place, from 0.
 * @returns {number} the id; NONE past the last.
 */
export function varId(
    _env,
    _index
)
{
    let total = varCount(_env);

    for (let f = isEnv(_env) ? _env : null; f !== null; f = f.parent)
    {
        const base = total - f.vars.length;

        if (_index >= total)
        {
            return NONE;
        }

        if (_index >= base)
        {
            return makeId(f.depth, _index - base);
        }

        total = base;
    }

    return NONE;
}

/**
 * A variable's place among those a frame sees: `varId`'s inverse.
 *
 * @param {?OptionEnv} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {number} the place; NONE for an id the frame does not see.
 */
export function varIndex(
    _env,
    _var
)
{
    if ( !isEnv(_env) ||
         (declOf(_env, _var) === null) )
    {
        return NONE;
    }

    const frame = atDepth(_env, _var >>> DEPTH_SHIFT);

    return varCount(frame.parent) + (_var & LOCAL);
}

/**
 * A variable's row: the object it was declared from.
 *
 * @param {?OptionEnv} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {?OptionRow} the row; null for an id the frame does not see.
 */
export function varAt(
    _env,
    _var
)
{
    const decl = isEnv(_env) ? declOf(_env, _var) : null;

    return (decl !== null) ? decl.row : null;
}

/**
 * The frame that declares a variable.
 *
 * @param {?OptionEnv} _env  a frame that sees it.
 * @param {number}      _var  the variable's id.
 * @returns {?OptionEnv} the frame; null for an id `_env` does not see.
 */
export function varFrame(
    _env,
    _var
)
{
    if ( !isEnv(_env) ||
         (declOf(_env, _var) === null) )
    {
        return null;
    }

    return atDepth(_env, _var >>> DEPTH_SHIFT);
}

function scopeNameInner(
    _env,
    _scope
)
{
    if ( !isEnv(_env)     ||
         (_scope === GLOBAL) ||
         !scopeOk(_env, _scope) )
    {
        return null;
    }

    return atDepth(_env, _scope >>> DEPTH_SHIFT)
              .scopes[(_scope & LOCAL) - 1];
}

// 3.2
/**
 * A scope's name.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id.
 * @returns {?string} the name; null for GLOBAL or an id the frame does not
 *          see.
 */
export function scopeName(
    _env,
    _scope
)
{
    const name = scopeNameInner(_env, _scope);

    return (name !== null) ? name : null;
}

function findInner(
    _env,
    _name
)
{
    if ( !isEnv(_env) ||
         (_name === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    for (let f = _env; f !== null; f = f.parent)
    {
        for (let i = 0; i < f.vars.length; ++i)
        {
            if ( equal(f.vars[i].name, _name, false) ||
                 equal(f.vars[i].alias, _name, false) )
            {
                return ok(makeId(f.depth, i));
            }
        }
    }

    return fail(STATUS.KEY_ABSENT);
}

/**
 * The variable of a name or an alias, the innermost frame's first.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name, with no frame or scope before it.
 * @returns {OptionResult} the id, or KEY_ABSENT.
 */
export function find(
    _env,
    _name
)
{
    return findInner(_env, toInner(_name, 'the name'));
}

function findScopeInner(
    _env,
    _name
)
{
    if ( !isEnv(_env) ||
         (_name === null) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    for (let f = _env; f !== null; f = f.parent)
    {
        for (let i = 0; i < f.scopes.length; ++i)
        {
            if (equal(f.scopes[i], _name, false))
            {
                return ok(makeId(f.depth, i + 1));
            }
        }
    }

    return fail(STATUS.KEY_ABSENT);
}

/**
 * The scope of a name, the innermost frame's first.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the scope's name.
 * @returns {OptionResult} the id, or KEY_ABSENT.
 */
export function findScope(
    _env,
    _name
)
{
    return findScopeInner(_env, toInner(_name, 'the name'));
}

/*
unqualify
  A name without the frame's own name and point before it.
*/
function unqualify(
    _env,
    _name
)
{
    const own = (_env.name !== null) ? _env.name.length : 0;

    return ( (own !== 0)                  &&
             (_name.length > own + 1)     &&
             (_name[own] === '.')         &&
             _name.startsWith(_env.name) ) ? _name.slice(own + 1) : _name;
}

function resolveInner(
    _env,
    _name
)
{
    if ( !isEnv(_env) ||
         (_name === null) )
    {
        return { ...fail(STATUS.INVALID_ARGUMENT), scope: GLOBAL };
    }

    const name = unqualify(_env, _name);
    const dot  = name.indexOf('.');

    if (dot < 0)
    {
        return { ...findInner(_env, name), scope: GLOBAL };
    }

    const scope = findScopeInner(_env, name.slice(0, dot));

    if (!scope.isOk)
    {
        return { ...scope, scope: GLOBAL };
    }

    return { ...findInner(_env, name.slice(dot + 1)), scope: scope.value };
}

/**
 * The variable and the scope a written name means: "name", "scope.name",
 * and either after the frame's own name and a point.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {OptionResult & {scope: number}} the variable's id, and in
 *          `scope` the scope's, GLOBAL where none is written; KEY_ABSENT
 *          for a scope or a variable the frame does not see.
 */
export function resolve(
    _env,
    _name
)
{
    return resolveInner(_env, toInner(_name, 'the name'));
}

function distanceInner(
    _name,
    _text
)
{
    const length = _name.length;
    const size   = _text.length;
    const rows   = [[], [], []];

    if ( (length > NAME_MAX) ||
         (size > NAME_MAX) )
    {
        return 9;
    }

    for (let j = 0; j <= size; ++j)
    {
        rows[1][j] = j;
    }

    for (let i = 1; i <= length; ++i)
    {
        const two  = rows[(i + 2) % 3];
        const one  = rows[i % 3];
        const here = rows[(i + 1) % 3];
        const a    = lower(_name[i - 1]);

        here[0] = i;

        for (let j = 1; j <= size; ++j)
        {
            const b    = lower(_text[j - 1]);
            const cost = (a === b) ? 0 : 1;
            let   best = one[j - 1] + cost;

            best = (one[j] + 1 < best) ? (one[j] + 1) : best;
            best = (here[j - 1] + 1 < best) ? (here[j - 1] + 1) : best;

            // a swap of the two last characters of each
            if ( (i > 1)                          &&
                 (j > 1)                          &&
                 (a === lower(_text[j - 2]))      &&
                 (lower(_name[i - 2]) === b)      &&
                 (two[j - 2] + 1 < best) )
            {
                best = two[j - 2] + 1;
            }

            here[j] = best;
        }
    }

    return rows[(length + 1) % 3][size];
}

function nearest(
    _env,
    _text,
    _scopes
)
{
    const limit = (_text.length <= 3) ? 1 : 2;
    let   best  = null;
    let   most  = limit + 1;

    for (let f = _env; f !== null; f = f.parent)
    {
        const count = _scopes ? f.scopes.length : (2 * f.vars.length);

        for (let i = 0; i < count; ++i)
        {
            const name = _scopes        ? f.scopes[i]
                       : ((i % 2) === 0) ? f.vars[i >> 1].name
                       : f.vars[i >> 1].alias;
            const far  = (name !== null) ? distanceInner(name, _text) : 9;

            if (far < most)
            {
                best = name;
                most = far;
            }
        }
    }

    return best;
}

// 3.3
/**
 * How far a text is from a name: the edits -- a character put in, taken
 * out or changed, or two neighbours swapped -- that make one the other,
 * without regard to ASCII case.
 *
 * @param {string} _name  the name.
 * @param {string} _text  the text.
 * @returns {number} the distance; 9 where either is longer than 63 units.
 */
export function distance(
    _name,
    _text
)
{
    const name = toInner(_name, 'the name');
    const text = toInner(_text, 'the text');

    if ( (name === null) ||
         (text === null) )
    {
        return 9;
    }

    return distanceInner(cstr(name), text);
}

function suggestInner(
    _env,
    _name
)
{
    if ( !isEnv(_env) ||
         (_name === null) )
    {
        return null;
    }

    let   name = unqualify(_env, _name);
    const dot  = name.indexOf('.');

    if ( (dot >= 0) &&
         !findScopeInner(_env, name.slice(0, dot)).isOk )
    {
        return nearest(_env, name.slice(0, dot), true);
    }

    if (dot >= 0)
    {
        name = name.slice(dot + 1);
    }

    return nearest(_env, name, false);
}

/**
 * The name a mistyped one was probably meant to be: the nearest name or
 * alias the frame sees, within one edit for a name of up to three
 * characters and two for a longer; for "scope.name" with an unknown scope,
 * the nearest scope.
 *
 * @param {?OptionEnv} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {?string} the name, bare; null where none is near.
 */
export function suggest(
    _env,
    _name
)
{
    const name = suggestInner(_env, toInner(_name, 'the name'));

    return (name !== null) ? name : null;
}


//==============================================================================
// 4.  READING
//==============================================================================

/*
read
  A binding's value into a value, with where it was bound.
*/
function read(
    _frame,
    _cell,
    _value
)
{
    switch (_value.kind)
    {
        case KIND.BOOL:
            _value.integer = (_cell.integer !== 0n) ? 1n : 0n;
            break;

        case KIND.REAL:
            _value.real = _cell.real;
            break;

        case KIND.TEXT:
            _value.text = (_cell.text !== null) ? _cell.text.chars : null;
            break;

        default:
            _value.integer = _cell.integer;
            break;
    }

    _value.bound  = true;
    _value.source = _cell.source;
    _value.depth  = _frame.depth;

    return;
}

function bears(
    _cell,
    _scope,
    _var
)
{
    return ( (_cell.var === _var) &&
             ( (_cell.scope === _scope) ||
               (_cell.scope === GLOBAL) ) );
}

/*
outranks
  Whether binding a is in force over binding b: the higher source, then the
deeper frame, then the scoped over the global.
*/
function outranks(
    _a,
    _aDepth,
    _b,
    _bDepth
)
{
    if (_a.source !== _b.source)
    {
        return (_a.source > _b.source);
    }

    if (_aDepth !== _bDepth)
    {
        return (_aDepth > _bDepth);
    }

    return ( (_a.scope !== GLOBAL) &&
             (_b.scope === GLOBAL) );
}

function inForce(
    _env,
    _scope,
    _var
)
{
    let best  = null;
    let frame = null;

    for (let f = _env; f !== null; f = f.parent)
    {
        for (const cell of f.cells.values())
        {
            if ( bears(cell, _scope, _var) &&
                 ( (best === null) ||
                   outranks(cell, f.depth, best, frame.depth) ) )
            {
                best  = cell;
                frame = f;
            }
        }
    }

    return { cell: best, frame: frame };
}

function defaultValue(
    _decl
)
{
    return {
        text:         _decl.text,
        integer:      _decl.integer,
        real:         _decl.real,
        kind:         _decl.kind,
        bound:        false,
        source:       SOURCE.DEFAULT,
        depth:        NONE
    };
}

/*
nameValue
  For a CHOICE or an INT, the value's name as its text, or none.
*/
function nameValue(
    _decl,
    _value
)
{
    if ( (_decl.kind !== KIND.CHOICE) &&
         (_decl.kind !== KIND.INT) )
    {
        return;
    }

    _value.text = null;

    for (let i = 0; i < _decl.name_count; ++i)
    {
        if (_decl.names[i].value === _value.integer)
        {
            _value.text = _decl.names[i].name;

            break;
        }
    }

    return;
}

/**
 * d_option_env_get, its value's text and its integer a BigInt.
 *
 * @returns {OptionResult & {got?: *, decl?: *, scope?: number}}
 */
function getInner(
    _env,
    _scope,
    _var
)
{
    const { status, decl } = check(_env, _scope, _var);

    if (status !== STATUS.OK)
    {
        return fail(status);
    }

    const { cell, frame } = inForce(_env, _scope, _var);
    const value           = defaultValue(decl);

    if (cell !== null)
    {
        read(frame, cell, value);
    }

    nameValue(decl, value);

    return { ...ok(_var), got: value, decl: decl };
}

/*
handed
  A value as a caller is handed one: its text a string, its integer a
number where the row's are exact and a bigint where not.
*/
function handed(
    _decl,
    _value
)
{
    return {
        text:         (_value.text !== null) ? _value.text : null,
        integer:      _decl.exact ? Number(_value.integer) : _value.integer,
        real:         _value.real,
        kind:         _value.kind,
        bound:        _value.bound,
        source:       _value.source,
        depth:        _value.depth
    };
}

/**
 * A value: the reference's struct dj_option_env_value.
 *
 * @typedef {object} OptionValue
 * @property {?string} text     a TEXT's value; a CHOICE's or an INT's
 *           value's name, where it has one; else null.
 * @property {number|bigint} integer  the value of a BOOL (0 or 1), an INT,
 *           a CHOICE or FLAGS: a number where every value the row can hold
 *           is an exact integer of a double, else a bigint.
 * @property {number}  real     a REAL's value.
 * @property {number}  kind     the variable's kind.
 * @property {boolean} bound    whether a binding gave it; false for the
 *           row's default.
 * @property {number}  source   the source of that binding; DEFAULT for
 *           none.
 * @property {number}  depth    the depth of the frame it was bound in;
 *           NONE for none.
 */

// 4.1
/**
 * The value in force for a variable in a scope.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {OptionResult & {got?: OptionValue}} the id, and in `got`
 *          the value; KEY_ABSENT for an id the frame does not see.
 */
export function get(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return result.isOk ? { ...ok(_var),
                           got: handed(result.decl, result.got) }
                       : result;
}

/**
 * A BOOL's value in force; false for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {boolean}
 */
export function bool(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return ( result.isOk                      &&
             (result.got.kind === KIND.BOOL)  &&
             (result.got.integer !== 0n) );
}

/**
 * The value in force of an INT, a CHOICE or FLAGS; 0 for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number|bigint} a number or a bigint, as the row's values are.
 */
export function int(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    if ( !result.isOk                     ||
         (result.got.kind === KIND.BOOL)  ||
         (result.got.kind === KIND.REAL)  ||
         (result.got.kind === KIND.TEXT) )
    {
        return 0;
    }

    return result.decl.exact ? Number(result.got.integer)
                             : result.got.integer;
}

/**
 * A REAL's value in force; 0 for anything else.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number}
 */
export function real(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return ( result.isOk &&
             (result.got.kind === KIND.REAL) ) ? result.got.real : 0;
}

/**
 * A TEXT's value in force, or the name of a CHOICE's or an INT's; null for
 * anything else, and for a value with no text.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string}
 */
export function text(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return ( result.isOk &&
             ( (result.got.kind === KIND.TEXT)   ||
               (result.got.kind === KIND.CHOICE) ||
               (result.got.kind === KIND.INT) )  &&
             (result.got.text !== null) ) ? result.got.text : null;
}

/**
 * The source of the value in force.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {number} the source; -1 for an id the frame does not see.
 */
export function source(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return result.isOk ? result.got.source : -1;
}

// 4.2
/**
 * Whether a frame itself binds a variable in exactly a scope, from any
 * source.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {boolean}
 */
export function isBound(
    _env,
    _scope,
    _var
)
{
    if (check(_env, _scope, _var).status !== STATUS.OK)
    {
        return false;
    }

    for (const cell of _env.cells.values())
    {
        if ( (cell.var === _var) &&
             (cell.scope === _scope) )
        {
            return true;
        }
    }

    return false;
}

/**
 * Whether a frame or an ancestor binds anything in exactly a scope.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @returns {boolean}
 */
export function scopeIsBound(
    _env,
    _scope
)
{
    for (let f = isEnv(_env) ? _env : null; f !== null; f = f.parent)
    {
        for (const cell of f.cells.values())
        {
            if (cell.scope === _scope)
            {
                return true;
            }
        }
    }

    return false;
}

/*
layersInner
  d_option_env_layers, each layer's value; null for the
reference's (size_t)-1.
*/
function layersInner(
    _env,
    _scope,
    _var,
    _capacity
)
{
    const { status, decl } = check(_env, _scope, _var);
    const capacity         = Math.min(_capacity, 64);
    const layers           = [];
    const cells            = [];
    let   count            = 0;

    if (status !== STATUS.OK)
    {
        return null;
    }

    for (let f = _env; f !== null; f = f.parent)
    {
        for (const cell of f.cells.values())
        {
            if (!bears(cell, _scope, _var))
            {
                continue;
            }

            const layer = { frame: f, scope: cell.scope, shown: false,
                            value: defaultValue(decl) };

            read(f, cell, layer.value);
            nameValue(decl, layer.value);

            // past every layer it does not outrank
            let at = Math.min(count, capacity);

            while ( (at > 0) &&
                    outranks(cell, f.depth, cells[at - 1],
                             layers[at - 1].frame.depth) )
            {
                --at;
            }

            if (at < capacity)
            {
                layers.splice(at, 0, layer);
                cells.splice(at, 0, cell);
                layers.length = Math.min(layers.length, capacity);
                cells.length  = Math.min(cells.length, capacity);
            }

            ++count;
        }
    }

    if ( (count > 0) &&
         (capacity > 0) )
    {
        layers[0].shown = true;
    }

    return { count: count, layers: layers, decl: decl };
}

/**
 * Every binding that bears on a variable in a scope, the one in force
 * first and the rest in the order they would come into force: what a
 * reader asked "why is it this?" is shown.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {number}      [_capacity=64]  the most layers to give; the
 *        reference gives at most 64.
 * @returns {{count: number, layers: Array<{frame: OptionEnv,
 *            scope: number, shown: boolean, value: OptionValue}>}}
 *          `count` is how many bindings bear, which may be more than are
 *          given; -1, with no layers, for an id the frame does not see.
 *          `shown` marks the one in force.
 */
export function layers(
    _env,
    _scope,
    _var,
    _capacity = 64
)
{
    const found = layersInner(_env, _scope, _var, _capacity);

    if (found === null)
    {
        return { count: -1, layers: [] };
    }

    return {
        count:  found.count,
        layers: found.layers.map((_layer) => ({
            frame: _layer.frame,
            scope: _layer.scope,
            shown: _layer.shown,
            value: handed(found.decl, _layer.value)
        }))
    };
}


//==============================================================================
// 5.  BINDING BY VALUE
//==============================================================================

/*
accepts
  The status of an integer for a row: OK, or why the row refuses it.
*/
function accepts(
    _decl,
    _integer
)
{
    let mask    = 0n;
    let unbuilt = 0n;

    if (_decl.kind === KIND.INT)
    {
        // within the range, or named; an unbuilt name's value is refused
        if ( ( (_integer >= _decl.minimum) &&
               (_integer <= _decl.maximum) ) ||
             isNamed(_decl, _integer) )
        {
            return STATUS.OK;
        }

        for (let i = 0; i < _decl.unbuilt_count; ++i)
        {
            if (_decl.unbuilt[i].value === _integer)
            {
                return STATUS.POLICY_REJECTED;
            }
        }

        return STATUS.INVALID_ARGUMENT;
    }

    if ( (_decl.kind !== KIND.CHOICE) &&
         (_decl.kind !== KIND.FLAGS) )
    {
        return STATUS.OK;
    }

    for (let i = 0; i < _decl.name_count; ++i)
    {
        mask |= _decl.names[i].value;

        if ( (_decl.kind === KIND.CHOICE) &&
             (_decl.names[i].value === _integer) )
        {
            return STATUS.OK;
        }
    }

    for (let i = 0; i < _decl.unbuilt_count; ++i)
    {
        unbuilt |= _decl.unbuilt[i].value;

        if ( (_decl.kind === KIND.CHOICE) &&
             (_decl.unbuilt[i].value === _integer) )
        {
            return STATUS.POLICY_REJECTED;
        }
    }

    if (_decl.kind === KIND.CHOICE)
    {
        return STATUS.INVALID_ARGUMENT;
    }

    // flags: bits no name has, of which some an unbuilt name has
    if ((_integer & ~mask) === 0n)
    {
        return STATUS.OK;
    }

    return ((_integer & ~mask & unbuilt) !== 0n) ? STATUS.POLICY_REJECTED
                                                 : STATUS.INVALID_ARGUMENT;
}

/*
bind
  Binds a variable in a scope, from a source, to a payload of a kind: the
one place a binding is made.
*/
function bind(
    _env,
    _scope,
    _var,
    _source,
    _kind,
    _payload
)
{
    const { status, decl } = check(_env, _scope, _var);

    if (status !== STATUS.OK)
    {
        return fail(status);
    }

    // INT carries CHOICE and FLAGS, whose storage it is
    if ( (decl.kind !== _kind) &&
         ( (_kind !== KIND.INT) ||
           ( (decl.kind !== KIND.CHOICE) &&
             (decl.kind !== KIND.FLAGS) ) ) )
    {
        return fail(STATUS.VALUE_TYPE_MISMATCH);
    }

    if (!sourceOk(_source))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    // a source the row refuses fails by name, as an unbuilt value does
    if ((decl.refused & refuses(_source)) !== 0)
    {
        return fail(STATUS.POLICY_REJECTED);
    }

    const key = cellKey(_scope, _source, _var);

    if ( !_env.cells.has(key) &&
         (_env.cells.size >= _env.bindingCapacity) )
    {
        return fail(STATUS.CAPACITY);
    }

    _env.cells.set(key, {
        scope:        _scope,
        source:       _source,
        var:          _var,
        integer:      _payload.integer ?? 0n,
        real:         _payload.real ?? 0,
        text:         _payload.text ?? null
    });
    ++_env.generation;

    return ok(_var);
}

function bindInt(
    _env,
    _scope,
    _var,
    _source,
    _integer
)
{
    const decl = isEnv(_env) ? declOf(_env, _var) : null;

    if (decl !== null)
    {
        const status = accepts(decl, _integer);

        if (status !== STATUS.OK)
        {
            return fail(status);
        }
    }

    return bind(_env, _scope, _var, _source, KIND.INT,
                { integer: _integer });
}

/*
borrowed
  A caller's text as a binding holds one it does not copy; null for none.
*/
function borrowed(
    _text
)
{
    return (_text !== null) ? { chars: cstr(_text), arena: false } : null;
}

// 5.1
/**
 * Binds a BOOL, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {boolean}    _value  the value.
 * @returns {OptionResult} the id; VALUE_TYPE_MISMATCH for a variable of
 *          another kind; POLICY_REJECTED for a row that refuses the
 *          program; CAPACITY for a frame that is full.
 */
export function setBool(
    _env,
    _scope,
    _var,
    _value
)
{
    return bind(_env, _scope, _var, SOURCE.PROGRAM, KIND.BOOL,
                { integer: _value ? 1n : 0n });
}

/**
 * Binds an INT, a CHOICE or FLAGS, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number|bigint} _value  the value; a number must be a whole one
 *        that is exact.
 * @returns {OptionResult} the id; INVALID_ARGUMENT for a value the row
 *          does not accept; POLICY_REJECTED for one that is named and not
 *          built.
 */
export function setInt(
    _env,
    _scope,
    _var,
    _value
)
{
    return bindInt(_env, _scope, _var, SOURCE.PROGRAM,
                   toInt64(_value, 'the value'));
}

/**
 * Binds a REAL, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number}     _value  the value.
 * @returns {OptionResult} the id.
 */
export function setReal(
    _env,
    _scope,
    _var,
    _value
)
{
    if (typeof _value !== 'number')
    {
        throw new TypeError('optionEnv.setReal: the value is not a ' +
                            'number');
    }

    return bind(_env, _scope, _var, SOURCE.PROGRAM, KIND.REAL,
                { real: _value });
}

/**
 * Binds a TEXT, as the program. The reference keeps the caller's pointer
 * and counts none of the frame's text room; so does this.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {?string}    _value  the text, or null.
 * @returns {OptionResult} the id.
 */
export function setText(
    _env,
    _scope,
    _var,
    _value
)
{
    return bind(_env, _scope, _var, SOURCE.PROGRAM, KIND.TEXT,
                { text: borrowed(toInner(_value, 'the value')) });
}

function setValueInner(
    _env,
    _scope,
    _var,
    _source,
    _value
)
{
    if ( (_value === null)      ||
         (_value === undefined) ||
         !sourceOk(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    switch (_value.kind)
    {
        case KIND.BOOL:
            return bind(_env, _scope, _var, _source, KIND.BOOL,
                        { integer: (_value.integer !== 0n) ? 1n : 0n });

        case KIND.REAL:
            return bind(_env, _scope, _var, _source, KIND.REAL,
                        { real: _value.real });

        case KIND.TEXT:
            return bind(_env, _scope, _var, _source, KIND.TEXT,
                        { text: borrowed(_value.text) });

        case KIND.INT:
        case KIND.CHOICE:
        case KIND.FLAGS:
            return bindInt(_env, _scope, _var, _source, _value.integer);

        default:
            return fail(STATUS.VALUE_TYPE_MISMATCH);
    }
}

/**
 * Binds a variable to a value, from a source.
 *
 * @param {OptionEnv} _env     the frame the binding is made in.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @param {{kind: number, integer?: (number|bigint|boolean), real?: number,
 *          text?: ?string}} _value  the value: its
 *        kind, and the member that kind reads.
 * @returns {OptionResult} the id; INVALID_ARGUMENT for no value or a
 *          source that is none; VALUE_TYPE_MISMATCH for a kind that is not
 *          the variable's.
 */
export function setValue(
    _env,
    _scope,
    _var,
    _source,
    _value
)
{
    if ( (_value === null) ||
         (_value === undefined) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return setValueInner(_env, _scope, _var, _source, {
        kind:         _value.kind,
        integer:      toInt64(_value.integer ?? 0, 'the value\'s integer'),
        real:         _value.real ?? 0,
        text:         toInner(_value.text, 'the value\'s text')
    });
}

/*
textCopy
  Binds a TEXT to a copy of text the frame keeps.
*/
function textCopy(
    _env,
    _scope,
    _var,
    _value,
    _source
)
{
    if (!sourceOk(_source))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const { status, decl } = check(_env, _scope, _var);

    if (status !== STATUS.OK)
    {
        return fail(status);
    }

    if (decl.kind !== KIND.TEXT)
    {
        return fail(STATUS.VALUE_TYPE_MISMATCH);
    }

    if (!alloc(_env, _value.length))
    {
        return fail(STATUS.BUFFER_TOO_SMALL);
    }

    return bind(_env, _scope, _var, _source, KIND.TEXT,
                { text: { chars: cstr(_value), arena: true } });
}

/**
 * Binds a TEXT to a copy of a text, as the program: the copy counts
 * against the frame's text room.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {string}     _value  the text.
 * @returns {OptionResult} the id; BUFFER_TOO_SMALL for a frame with no
 *          room for it.
 */
export function setTextCopy(
    _env,
    _scope,
    _var,
    _value
)
{
    return textCopy(_env, _scope, _var, toInner(_value, 'the value') ?? '',
                    SOURCE.PROGRAM);
}

// 5.2
/**
 * Drops a frame's own bindings of a variable in exactly a scope, from
 * every source.
 *
 * @param {OptionEnv} _env    the frame.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @returns {OptionResult} the id, whether or not anything was bound.
 */
export function unset(
    _env,
    _scope,
    _var
)
{
    const { status } = check(_env, _scope, _var);
    let   removed    = false;

    if (status !== STATUS.OK)
    {
        return fail(status);
    }

    for (let from = SOURCE.PROGRAM; from < SOURCES; ++from)
    {
        removed = _env.cells.delete(cellKey(_scope, from, _var)) || removed;
    }

    if (removed)
    {
        ++_env.generation;
    }

    return ok(_var);
}

/**
 * Drops a frame's own binding of a variable in exactly a scope, from one
 * source.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} the id, whether or not anything was bound.
 */
export function unsetFrom(
    _env,
    _scope,
    _var,
    _source
)
{
    const { status } = check(_env, _scope, _var);

    if (status !== STATUS.OK)
    {
        return fail(status);
    }

    if (!sourceOk(_source))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if (_env.cells.delete(cellKey(_scope, _source, _var)))
    {
        ++_env.generation;
    }

    return ok(_var);
}

/**
 * Unbinds everything a frame holds bound at one source, in every scope.
 * The port's own: the reference's program has no need of it, since what
 * a process bound from its command line ends with the process, and a
 * page's program does not end (src/djinterp.js, `run`).
 *
 * @param {OptionEnv} _env     the frame; its own bindings only, not its
 *        ancestors'.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} how many bindings went.
 */
export function unsetSource(
    _env,
    _source
)
{
    let count = 0;

    if ( !isEnv(_env) ||
         !sourceOk(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    for (const key of [..._env.cells.keys()])
    {
        if (key.split('/')[1] === String(_source))
        {
            _env.cells.delete(key);
            ++count;
        }
    }

    if (count !== 0)
    {
        ++_env.generation;
    }

    return ok(count);
}


//==============================================================================
// 6.  BINDING FROM TEXT
//==============================================================================

const YES = ['1', 'true', 'yes', 'on', 'y'];
const NO  = ['0', 'false', 'no', 'off', 'n'];

function readBool(
    _text
)
{
    for (let i = 0; i < YES.length; ++i)
    {
        if (equal(YES[i], _text, true))
        {
            return 1n;
        }

        if (equal(NO[i], _text, true))
        {
            return 0n;
        }
    }

    return null;
}

/*
readInt
  A 64-bit integer from a text: a sign, a base prefix 0x, 0o or 0b, and
digits; null for anything else, and for a value that does not fit.
*/
function readInt(
    _text
)
{
    const size      = _text.length;
    let   at        = 0;
    let   negative  = false;
    let   base      = 10n;
    let   magnitude = 0n;

    if ( (size > 0) &&
         ( (_text[0] === '+') ||
           (_text[0] === '-') ) )
    {
        negative = (_text[0] === '-');
        ++at;
    }

    // a base prefix
    if ( (at + 1 < size) &&
         (_text[at] === '0') )
    {
        const prefix = lower(_text[at + 1]);

        base = (prefix === 'x') ? 16n
             : (prefix === 'o') ? 8n
             : (prefix === 'b') ? 2n
             : 10n;

        if (base !== 10n)
        {
            at += 2;
        }
    }

    if (at === size)
    {
        return null;
    }

    for (; at < size; ++at)
    {
        const c     = lower(_text[at]);
        let   digit = 16n;

        if ( (c >= '0') &&
             (c <= '9') )
        {
            digit = BigInt(c.charCodeAt(0) - 48);
        }
        else if ( (c >= 'a') &&
                  (c <= 'f') )
        {
            digit = BigInt(c.charCodeAt(0) - 97 + 10);
        }

        // a digit of the base, and no overflow
        if ( (digit >= base) ||
             (magnitude > (UINT64_MAX - digit) / base) )
        {
            return null;
        }

        magnitude = (magnitude * base) + digit;
    }

    const limit = negative ? (INT64_MAX + 1n) : INT64_MAX;

    if (magnitude > limit)
    {
        return null;
    }

    return negative ? -magnitude : magnitude;
}

/*
readRealText
  A real from a text, whole: C's alphabet, or one of the words, and what
strtod makes of it; null for anything else, and for a value past the
largest double.
*/
function readRealText(
    _text
)
{
    const size = _text.length;

    if ( (size === 0) ||
         (size >= 64) )
    {
        return null;
    }

    const body    = ( (_text[0] === '+') ||
                      (_text[0] === '-') ) ? _text.slice(1) : _text;
    const special = ( equal('inf', body, true)      ||
                      equal('infinity', body, true) ||
                      equal('nan', body, true) );

    for (let i = 0; i < size; ++i)
    {
        const c = _text[i];

        // C's alphabet, or a special word as a whole
        if ( !special &&
             !( ((c >= '0') && (c <= '9')) ||
                (c === '+') || (c === '-') ||
                (c === '.') || (c === 'e') ||
                (c === 'E') ) )
        {
            return null;
        }
    }

    const read = readReal(_text);

    if ( (read.length !== size) ||
         read.overflow )
    {
        return null;
    }

    return read;
}

function namesValue(
    _names,
    _count,
    _text
)
{
    for (let i = 0; i < _count; ++i)
    {
        if (equal(_names[i].name, _text, true))
        {
            return _names[i].value;
        }
    }

    return null;
}

/*
readChoice
  A named value by its name, without regard to case, or a number: for a
CHOICE, an INT, and each term of FLAGS.
*/
function readChoice(
    _decl,
    _text
)
{
    let value = namesValue(_decl.names, _decl.name_count, _text);

    if (value !== null)
    {
        return { status: STATUS.OK, value: value };
    }

    value = namesValue(_decl.unbuilt, _decl.unbuilt_count, _text);

    if (value !== null)
    {
        return { status: STATUS.POLICY_REJECTED, value: value };
    }

    value = readInt(_text);

    return (value !== null) ? { status: STATUS.OK, value: value }
                            : { status: STATUS.INVALID_ARGUMENT, value: 0n };
}

/*
readFlags
  Flags from terms separated by ',', '|' or space. A text that starts with
a sign edits the value in force: "+name" sets bits and "-name" clears them.
*/
function readFlags(
    _env,
    _scope,
    _var,
    _decl,
    _text
)
{
    const size  = _text.length;
    let   value = 0n;
    let   at    = 0;

    if ( (size > 0) &&
         ( (_text[0] === '+') ||
           (_text[0] === '-') ) )
    {
        const now = getInner(_env, _scope, _var);

        value = now.isOk ? now.got.integer : 0n;
    }

    while (at < size)
    {
        let sign = '+';

        // skip separators, then one term
        while ( (at < size) &&
                ( (_text[at] === ',') ||
                  (_text[at] === '|') ||
                  isSpace(_text[at]) ) )
        {
            ++at;
        }

        if (at === size)
        {
            break;
        }

        if ( (_text[at] === '+') ||
             (_text[at] === '-') )
        {
            sign = _text[at++];
        }

        const start = at;

        while ( (at < size) &&
                isNameChar(_text[at]) )
        {
            ++at;
        }

        /** @type {{status: number, value: bigint}} */
        const term = (at === start)
                         ? { status: STATUS.INVALID_ARGUMENT, value: 0n }
                         : readChoice(_decl, _text.slice(start, at));

        if (term.status !== STATUS.OK)
        {
            return term;
        }

        // the reference's 64 bits: a term may be any integer that fits
        value = BigInt.asIntN(64, (sign === '-') ? (value & ~term.value)
                                                 : (value | term.value));
    }

    return { status: STATUS.OK, value: value };
}

/*
assignValue
  Binds a variable from a value's text, read as its kind reads one.
*/
function assignValue(
    _env,
    _scope,
    _var,
    _value,
    _source
)
{
    const decl = declOf(_env, _var);

    if (decl.kind === KIND.TEXT)
    {
        return textCopy(_env, _scope, _var, _value, _source);
    }

    const value  = defaultValue(decl);
    const text_  = trim(_value).text;
    let   status = STATUS.OK;
    let   read_;

    switch (decl.kind)
    {
        case KIND.BOOL:
            read_         = readBool(text_);
            status        = (read_ !== null) ? STATUS.OK
                                             : STATUS.INVALID_ARGUMENT;
            value.integer = read_ ?? 0n;
            break;

        case KIND.REAL:
            read_  = readRealText(text_);
            status = (read_ !== null) ? STATUS.OK : STATUS.INVALID_ARGUMENT;

            if (read_ !== null)
            {
                value.real = read_.value;
            }
            break;

        case KIND.INT:
        case KIND.CHOICE:
            // a number, or one of the row's named values by its name
            read_         = readChoice(decl, text_);
            status        = read_.status;
            value.integer = read_.value;
            break;

        default:
            read_         = readFlags(_env, _scope, _var, decl, text_);
            status        = read_.status;
            value.integer = read_.value;
            break;
    }

    // a value read from text is not a text the binding borrows
    value.text = null;

    return (status === STATUS.OK)
               ? setValueInner(_env, _scope, _var, _source, value)
               : fail(status);
}

function assignFromInner(
    _env,
    _name,
    _value,
    _source
)
{
    if ( !isEnv(_env)     ||
         (_name === null) ||
         (_value === null) ||
         !sourceOk(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const found = resolveInner(_env, _name);

    if (!found.isOk)
    {
        return fail(found.error);
    }

    return assignValue(_env, found.scope, found.value, _value, _source);
}

// 6.1
/**
 * Binds a variable by its written name from a value's text, from a source.
 * The value is read as the variable's kind reads one: a BOOL from "true",
 * "yes", "on", "y", "1" and their opposites; an INT from a number in base
 * 10, 0x, 0o or 0b, or the name of one of its named values; a REAL from
 * what C's strtod reads, less the hexadecimal form; a CHOICE from a name
 * or a number; FLAGS from names separated by ',' or '|', each perhaps
 * after '+' or '-'; a TEXT from the text as it is.
 *
 * @param {OptionEnv} _env     the frame the binding is made in.
 * @param {string}     _name    the name: "name" or "scope.name", perhaps
 *        after the frame's own name and a point.
 * @param {string}     _value   the value's text.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult} the variable's id; KEY_ABSENT for a name the
 *          frame does not see; INVALID_ARGUMENT for a text that is not a
 *          value of the kind, or one the row does not accept;
 *          POLICY_REJECTED for a named value that is not built, or a
 *          source the row refuses.
 */
export function assignFrom(
    _env,
    _name,
    _value,
    _source
)
{
    return assignFromInner(_env, toInner(_name, 'the name'),
                           toInner(_value, 'the value') ?? '', _source);
}

/**
 * `assignFrom`, as the program.
 *
 * @param {OptionEnv} _env    the frame the binding is made in.
 * @param {string}     _name   the name as written.
 * @param {string}     _value  the value's text.
 * @returns {OptionResult}
 */
export function assign(
    _env,
    _name,
    _value
)
{
    return assignFrom(_env, _name, _value, SOURCE.PROGRAM);
}

/*
escape
  One escape of a quoted value, after its backslash: the unit it stands
for, and how far it reached; null for one that is none.
*/
function escape(
    _text,
    _at
)
{
    switch (_text[_at])
    {
        case '"':  return { unit: '"', at: _at };
        case '\\': return { unit: '\\', at: _at };
        case '\'': return { unit: '\'', at: _at };
        case 'n':  return { unit: '\n', at: _at };
        case 'r':  return { unit: '\r', at: _at };
        case 't':  return { unit: '\t', at: _at };
        case '0':  return { unit: '\0', at: _at };
        case 'x':  break;
        default:   return null;
    }

    // x: exactly two hexadecimal digits
    if (_at + 2 >= _text.length)
    {
        return null;
    }

    const code = readInt('0x' + _text[_at + 1] + _text[_at + 2]);

    if (code === null)
    {
        return null;
    }

    return { unit: String.fromCharCode(Number(code) & 0xFF), at: _at + 2 };
}

function unescape(
    _text
)
{
    let out = '';

    for (let i = 0; i < _text.length; ++i)
    {
        let c = _text[i];

        // an escape: one character, or \xHH
        if (c === '\\')
        {
            const read_ = (++i === _text.length) ? null : escape(_text, i);

            if (read_ === null)
            {
                return null;
            }

            c = read_.unit;
            i = read_.at;
        }

        out += c;
    }

    return out;
}

/*
quoted
  Binds a variable from the inside of a quoted value.
*/
function quoted(
    _env,
    _scope,
    _var,
    _text,
    _source
)
{
    const decl = declOf(_env, _var);

    if (decl.kind === KIND.TEXT)
    {
        if (!alloc(_env, _text.length))
        {
            return fail(STATUS.BUFFER_TOO_SMALL);
        }

        // a refused escape leaves room taken, given back by compaction
        const plain = unescape(_text);

        if (plain === null)
        {
            return fail(STATUS.INVALID_ARGUMENT);
        }

        return bind(_env, _scope, _var, _source, KIND.TEXT,
                    { text: { chars: cstr(plain), arena: true } });
    }

    const plain = (_text.length > SCRATCH) ? null : unescape(_text);

    if (plain === null)
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return assignValue(_env, _scope, _var, plain, _source);
}

/*
act
  What a statement does once its name is read: binds a bare BOOL true,
unsets, or assigns what follows '='.
*/
function act(
    _env,
    _text,
    _at,
    _unset,
    _scope,
    _var,
    _source
)
{
    const size = _text.length;
    let   at   = _at;

    if (at === size)
    {
        if (_unset)
        {
            return unsetFrom(_env, _scope, _var, _source);
        }

        return (declOf(_env, _var).kind === KIND.BOOL)
                   ? bind(_env, _scope, _var, _source, KIND.BOOL,
                          { integer: 1n })
                   : fail(STATUS.INVALID_ARGUMENT);
    }

    if ( _unset ||
         (_text[at] !== '=') )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    do
    {
        ++at;
    } while ( (at < size) &&
              isSpace(_text[at]) );

    // an unquoted value is the rest; a quoted one must end the statement
    if ( (at === size) ||
         (_text[at] !== '"') )
    {
        return assignValue(_env, _scope, _var, _text.slice(at), _source);
    }

    let close = at + 1;

    while ( (close < size) &&
            (_text[close] !== '"') )
    {
        close += (_text[close] === '\\') ? 2 : 1;
    }

    if (close !== size - 1)
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return quoted(_env, _scope, _var, _text.slice(at + 1, close), _source);
}

function statement(
    _env,
    _text,
    _source
)
{
    const text_ = trim(_text).text;
    const size  = text_.length;
    const unset_ = ( (size > 0) &&
                     (text_[0] === '-') ) ? 1 : 0;
    let   at    = unset_;

    // the name: an identifier, with an optional "frame." and "scope."
    while ( (at < size) &&
            ( isNameChar(text_[at]) ||
              (text_[at] === '.') ) )
    {
        ++at;
    }

    const found = resolveInner(_env, text_.slice(unset_, at));

    while ( (at < size) &&
            isSpace(text_[at]) )
    {
        ++at;
    }

    if (!found.isOk)
    {
        return (at === unset_) ? fail(STATUS.INVALID_ARGUMENT)
                               : fail(found.error);
    }

    return act(_env, text_, at, (unset_ !== 0), found.scope, found.value,
               _source);
}

function putNFromInner(
    _env,
    _statement,
    _source
)
{
    if ( !isEnv(_env)           ||
         (_statement === null)  ||
         !sourceOk(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return statement(_env, _statement, _source);
}

// 6.2
/**
 * Carries out one statement, from a source: "name = value" binds; "name"
 * binds a BOOL true; "-name" drops the source's binding. A value in double
 * quotes may hold \" \\ \' \n \r \t \0 and \xHH, and must end the
 * statement.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement; read up to a NUL.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {OptionResult} the variable's id; INVALID_ARGUMENT for a
 *          statement with no name, with text after a bare name, or with a
 *          value the variable refuses; KEY_ABSENT for a name the frame
 *          does not see.
 */
export function putFrom(
    _env,
    _statement,
    _source
)
{
    const text_ = toInner(_statement, 'the statement');

    return putNFromInner(_env, (text_ !== null) ? cstr(text_) : null,
                         _source);
}

/**
 * `putFrom`, as the program.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement.
 * @returns {OptionResult}
 */
export function put(
    _env,
    _statement
)
{
    return putFrom(_env, _statement, SOURCE.PROGRAM);
}

/**
 * `putFrom` for a statement given whole, a NUL in it included: the
 * reference's form for text that carries its length.
 *
 * @param {OptionEnv} _env        the frame.
 * @param {string}     _statement  the statement.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {OptionResult}
 */
export function putNFrom(
    _env,
    _statement,
    _source
)
{
    return putNFromInner(_env, toInner(_statement, 'the statement') ?? '',
                         _source);
}

function statementEndInner(
    _script,
    _at
)
{
    const size   = _script.length;
    let   at     = _at;
    let   quote  = false;

    while ( (at < size) &&
            ( quote ||
              ( (_script[at] !== ';')  &&
                (_script[at] !== '\n') &&
                (_script[at] !== '#') ) ) )
    {
        if ( (_script[at] === '\\') &&
             quote                  &&
             (at + 1 < size) )
        {
            ++at;
        }
        else if (_script[at] === '"')
        {
            quote = !quote;
        }

        ++at;
    }

    return at;
}

// 6.3
/**
 * Where the statement that starts at an offset ends: at the next ';',
 * line break or '#' outside double quotes, or the script's end.
 *
 * @param {string} _script  the script.
 * @param {number} _at      where the statement starts, an index into the
 *        script.
 * @returns {number} the index of its end.
 */
export function statementEnd(
    _script,
    _at
)
{
    const script = toInner(_script, 'the script');

    return (script !== null) ? statementEndInner(cstr(script), _at) : _at;
}

function loadFromInner(
    _env,
    _script,
    _source
)
{
    let at    = 0;
    let count = 0;

    if ( !isEnv(_env)        ||
         (_script === null)  ||
         !sourceOk(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const size = _script.length;

    while (at < size)
    {
        const start = at;

        at = statementEndInner(_script, at);

        const trimmed = trim(_script.slice(start, at));

        if (trimmed.text.length > 0)
        {
            const result = statement(_env, trimmed.text, _source);

            if (!result.isOk)
            {
                return { ...result, errorOffset: start + trimmed.start };
            }

            ++count;
        }

        // a comment runs to its line's end
        if (_script[at] === '#')
        {
            while ( (at < size) &&
                    (_script[at] !== '\n') )
            {
                ++at;
            }
        }

        if (at < size)
        {
            ++at;
        }
    }

    return ok(count);
}

/**
 * Carries out a script, from a source: statements separated by ';' or a
 * line break, with '#' starting a comment that runs to its line's end. It
 * stops at the first statement refused; those before it stay carried out.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {string}     _script  the script; read up to a NUL.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {OptionResult & {errorOffset?: number}} how many statements
 *          were carried out; or the refusal, with in `errorOffset` where
 *          the refused statement starts, an index into the script.
 */
export function loadFrom(
    _env,
    _script,
    _source
)
{
    const script = toInner(_script, 'the script');

    return loadFromInner(_env, (script !== null) ? cstr(script) : null,
                         _source);
}

/**
 * `loadFrom`, as the program.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {string}     _script  the script.
 * @returns {OptionResult & {errorOffset?: number}}
 */
export function load(
    _env,
    _script
)
{
    return loadFrom(_env, _script, SOURCE.PROGRAM);
}

/*
lookupOf
  An environment as a function from a variable's name to its value, or
null: from a Map, an object or a function of strings.
*/
function lookupOf(
    _environment
)
{
    const ask = (_environment instanceof Map)
                    ? (_key) => _environment.get(_key)
              : (typeof _environment === 'function')
                    ? _environment
              : ( (_environment !== null) &&
                  (typeof _environment === 'object') )
                    ? (_key) => (Object.hasOwn(_environment, _key)
                                     ? _environment[_key]
                                     : undefined)
              : () => undefined;

    return (_key) =>
    {
        const value = ask(_key);

        return (typeof value === 'string') ? cstr(value) : null;
    };
}

/*
getenv
  The environment's value for a prefix and a row's name in upper case; null
for no name, a name too long, or no such variable.
*/
function getenv(
    _lookup,
    _prefix,
    _name
)
{
    if ( (_name === null) ||
         (_prefix.length + _name.length >= SCRATCH) )
    {
        return null;
    }

    let key = _prefix;

    for (let c = 0; c < _name.length; ++c)
    {
        key += ( (_name[c] >= 'a') &&
                 (_name[c] <= 'z') )
                   ? String.fromCharCode(_name.charCodeAt(c) - 32)
                   : _name[c];
    }

    return _lookup(key);
}

function importInner(
    _env,
    _prefix,
    _lookup
)
{
    let failure = ok(0);
    let count   = 0;

    if (!isEnv(_env))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const total = varCount(_env);

    for (let k = 0; k < total; ++k)
    {
        const id   = varId(_env, k);
        const decl = declOf(_env, id);
        const seen = findInner(_env, decl.name);
        let   value = getenv(_lookup, _prefix, decl.name);

        // a variable an inner frame's hides is not read
        if ( !seen.isOk ||
             (seen.value !== id) )
        {
            continue;
        }

        if (value === null)
        {
            value = getenv(_lookup, _prefix, decl.alias);
        }

        if (value !== null)
        {
            const result = assignValue(_env, GLOBAL, id, value,
                                       SOURCE.ENVIRONMENT);

            if (result.isOk)
            {
                ++count;
            }
            else if (failure.isOk)
            {
                failure = result;
            }
        }
    }

    return failure.isOk ? ok(count) : failure;
}

// 6.4
/**
 * Binds, as the environment, every variable a frame sees that the
 * environment names: PREFIX and the row's name in upper case, or its
 * alias's. A value refused does not stop the rest.
 *
 * The reference reads the process's environment. A page has none, so the
 * environment is given: the caller decides what stands in for it.
 *
 * Exported as `import` too, the reference's name: `optionEnv.import(...)`.
 *
 * @param {OptionEnv} _env     the frame.
 * @param {?string}    _prefix  what each variable's name follows, or null
 *        for nothing.
 * @param {Map<string, string>|Record<string, string>|
 *         function(string): (string|undefined)} _environment  the
 *        environment: names to values.
 * @returns {OptionResult} how many were bound; or the first refusal.
 */
export function import_(
    _env,
    _prefix,
    _environment
)
{
    return importInner(_env, cstr(toInner(_prefix, 'the prefix') ?? ''),
                       lookupOf(_environment));
}

export { import_ as import };


//==============================================================================
// 7.  WRITING TEXT
//==============================================================================

/**
 * The row's name whose bits are all still to be written and are the most;
 * -1 for none.
 *
 * @param {*}      _decl  the row, as the machine holds it.
 * @param {bigint} _left  the bits still to be written.
 * @returns {number}
 */
function widest(
    _decl,
    _left
)
{
    let best      = -1;
    let bestCount = 0;

    for (let i = 0; i < _decl.name_count; ++i)
    {
        /** @type {bigint} */
        const bits  = _decl.names[i].value;
        let   count = 0;

        if ( (bits === 0n) ||
             ((bits & ~_left) !== 0n) )
        {
            continue;
        }

        for (let b = BigInt.asUintN(64, bits); b !== 0n; b &= b - 1n)
        {
            ++count;
        }

        if (count > bestCount)
        {
            best      = i;
            bestCount = count;
        }
    }

    return best;
}

function formatFlags(
    _decl,
    _value
)
{
    let out  = '';
    let left = _value;

    for (let first = true; left !== 0n; first = false)
    {
        const best = widest(_decl, left);

        if (!first)
        {
            out += '|';
        }

        // bits no name covers, as one number
        if (best < 0)
        {
            return out + '0x' + BigInt.asUintN(64, left).toString(16);
        }

        out  += _decl.names[best].name;
        left &= ~_decl.names[best].value;
    }

    // nothing set: a name for 0, or 0
    if (_value === 0n)
    {
        let zero = '0';

        for (let i = 0; i < _decl.name_count; ++i)
        {
            if (_decl.names[i].value === 0n)
            {
                zero = _decl.names[i].name;

                break;
            }
        }

        out += zero;
    }

    return out;
}

function formatValue(
    _decl,
    _value
)
{
    switch (_value.kind)
    {
        case KIND.BOOL:
            return (_value.integer !== 0n) ? 'true' : 'false';

        case KIND.REAL:
            return formatReal(_value.real);

        case KIND.TEXT:
            return (_value.text !== null) ? _value.text : '';

        case KIND.FLAGS:
            return formatFlags(_decl, _value.integer);

        default:
            // INT and CHOICE: the value's name where it has one, else its
            // number
            return (_value.text !== null) ? _value.text
                                          : _value.integer.toString();
    }
}

function formatInner(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    return result.isOk ? formatValue(result.decl, result.got) : null;
}

function needsQuotes(
    _text
)
{
    const size = _text.length;

    if ( (size === 0)                                         ||
         (_text[0] === ' ')         || (_text[0] === '\t')     ||
         (_text[size - 1] === ' ')  || (_text[size - 1] === '\t') )
    {
        return true;
    }

    for (let i = 0; i < size; ++i)
    {
        const c = _text.charCodeAt(i);

        if ( (c === 0x3B) || (c === 0x23) || (c === 0x22) || (c === 0x5C) ||
             (c < 0x20)   || (c === 0x7F) )
        {
            return true;
        }
    }

    return false;
}

const HEX = '0123456789ABCDEF';

function appendQuoted(
    _text
)
{
    let out = '"';

    for (let i = 0; i < _text.length; ++i)
    {
        const c = _text.charCodeAt(i);

        switch (_text[i])
        {
            case '"':  out += '\\"';  break;
            case '\\': out += '\\\\'; break;
            case '\n': out += '\\n';  break;
            case '\r': out += '\\r';  break;
            case '\t': out += '\\t';  break;
            default:
                out += ( (c < 0x20) || (c === 0x7F) )
                           ? ('\\x' + HEX[c >> 4] + HEX[c & 0x0F])
                           : _text[i];
                break;
        }
    }

    return out + '"';
}

function formatQuotedInner(
    _env,
    _scope,
    _var
)
{
    const result = getInner(_env, _scope, _var);

    if ( !result.isOk                     ||
         (result.got.kind !== KIND.TEXT)  ||
         (result.got.text === null)       ||
         !needsQuotes(result.got.text) )
    {
        return formatInner(_env, _scope, _var);
    }

    return appendQuoted(result.got.text);
}

// 7.1
/**
 * The value in force as text: "true" or "false"; a number; a REAL as
 * "%.17g" writes it; a TEXT as it is, and a null one as nothing; a CHOICE
 * or an INT by its value's name where it has one; FLAGS as names joined by
 * '|', the widest first, with bits no name covers in hexadecimal.
 *
 * The reference writes into a buffer and returns the length; this returns
 * the text, whole.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string} the text; null for an id the frame does not see.
 */
export function format(
    _env,
    _scope,
    _var
)
{
    const out = formatInner(_env, _scope, _var);

    return (out !== null) ? out : null;
}

/**
 * `format`, with a TEXT written so that a statement reads it back: in
 * double quotes, with escapes, where it is empty, starts or ends with a
 * space or tab, or holds ';', '#', '"', a backslash or a control
 * character.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string} the text; null for an id the frame does not see.
 */
export function formatQuoted(
    _env,
    _scope,
    _var
)
{
    const out = formatQuotedInner(_env, _scope, _var);

    return (out !== null) ? out : null;
}


//==============================================================================
// 8.  READING ON A HOT PATH
//==============================================================================

// 8.1
/**
 * The value in force, read again only when the frame's generation has
 * moved since the cache was filled.
 *
 * @param {?OptionEnv} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {{filled?: boolean, generation?: number, value?: OptionValue}}
 *        _cache  the caller's cache for this variable in this scope; an
 *        empty object to start with.
 * @returns {?OptionValue} the value; one of kind 0 for an id the frame
 *          does not see; null for no cache.
 */
export function cached(
    _env,
    _scope,
    _var,
    _cache
)
{
    if ( (_cache === null) ||
         (typeof _cache !== 'object') )
    {
        return null;
    }

    const now = generation(_env);

    if ( !_cache.filled ||
         (_cache.generation !== now) )
    {
        const result = get(_env, _scope, _var);

        _cache.value      = result.isOk
                                ? result.got
                                : { text: null, integer: 0, real: 0, kind: 0,
                                    bound: false, source: 0, depth: 0 };
        _cache.generation = now;
        _cache.filled     = true;
    }

    return _cache.value;
}


//==============================================================================
// 9.  INNER
//==============================================================================

// 9.1
/**
 * The machine without its checks of what a caller hands in: each takes
 * strings as they are, and integers as BigInt. For the modules that stand
 * on this one -- the registry, the djin writers, the program's commands.
 * `decl` gives a variable's row as the machine holds it.
 */
export const inner = Object.freeze({
    cstr:          cstr,
    decl:          (_env, _var) => (isEnv(_env) ? declOf(_env, _var)
                                                : null),
    isIdentifier: isIdentifier,
    find:         findInner,
    findScope:    findScopeInner,
    resolve:      resolveInner,
    distance:     distanceInner,
    suggest:      suggestInner,
    scopeName:    scopeNameInner,
    get:          getInner,
    layers:       layersInner,
    assignFrom:   assignFromInner,
    putNFrom:     putNFromInner,
    loadFrom:     loadFromInner,
    statementEnd: statementEndInner,
    import:       importInner,
    lookupOf:     lookupOf,
    format:       formatInner,
    formatQuoted: formatQuotedInner,
    formatValue:  formatValue
});
