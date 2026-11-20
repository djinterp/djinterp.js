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
*   - TEXT IS BYTES INSIDE. The reference's lengths, offsets and escapes
*     count bytes. Every exported function takes and gives JavaScript
*     strings, and changes them at the boundary (src/text/utf8.js); the
*     offset a script's refusal is reported at is in bytes of its UTF-8,
*     as the reference reports it. The functions under `bytes` take and
*     give byte strings, for the modules that stand on this one.
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
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  Vocabulary
    1.  KIND, SOURCE, SOURCES, GLOBAL, NONE, DEPTH_MAX
    2.  refuses, id_depth, id_index
    3.  kind_name, source_name
    4.  row_bool ... row_flags
2.  Setting up
    1.  init
    2.  declare, declare_all
    3.  set_scopes, set_parent, set_name
    4.  clear, detach, generation, root, name
3.  Finding
    1.  var_count, var_id, var_index, var_at, var_frame
    2.  scope_name, find, find_scope, resolve
    3.  distance, suggest
4.  Reading
    1.  get, bool, int, real, text, source
    2.  is_bound, scope_is_bound, layers
5.  Binding by value
    1.  set_bool, set_int, set_real, set_text, set_value, set_text_copy
    2.  unset, unset_from
6.  Binding from text
    1.  assign_from, assign
    2.  put_from, put, put_n_from
    3.  statement_end, load_from, load
    4.  import
7.  Writing text
    1.  format, format_quoted
8.  Reading on a hot path
    1.  cached
9.  Bytes
    1.  bytes
*/

import data from '../../generated/option.js';
import { format_real } from '../text/real_format.js';
import { read_real } from '../text/real_read.js';
import { decode, encode } from '../text/utf8.js';
import { STATUS, fail, ok } from './option_common.js';


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

/** No variable: what `var_id` gives past the last. */
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
export function id_depth(
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
export function id_index(
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
export function kind_name(
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
export function source_name(
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
 * @typedef {object} option_row
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
 * @returns {option_row}
 */
export function row_bool(
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
 * @returns {option_row}
 */
export function row_int(
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
 * @returns {option_row}
 */
export function row_int_range(
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
 * @returns {option_row}
 */
export function row_real(
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
 * @returns {option_row}
 */
export function row_text(
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
 * @returns {option_row}
 */
export function row_choice(
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
 * @returns {option_row}
 */
export function row_flags(
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
  A byte string as C reads one handed to it without a length: up to its
first NUL.
*/
function cstr(
    _bytes
)
{
    const nul = _bytes.indexOf('\0');

    return (nul < 0) ? _bytes : _bytes.slice(0, nul);
}

/*
to_bytes
  A caller's string as bytes; null for null or undefined.
*/
function to_bytes(
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
        throw new TypeError('option_env: ' + _what + ' is not a string');
    }

    return encode(_text);
}

/*
to_int64
  A caller's integer as a BigInt: a bigint, a whole number, or a decimal
string as generated JSON carries one.
*/
function to_int64(
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
        throw new TypeError('option_env: ' + _what +
                            ' is not an exact integer');
    }

    if ( (value < INT64_MIN) ||
         (value > INT64_MAX) )
    {
        throw new RangeError('option_env: ' + _what +
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

function is_space(
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

function is_name_char(
    _c
)
{
    return ( (_c !== undefined) &&
             ( ((_c >= 'a') && (_c <= 'z')) ||
               ((_c >= 'A') && (_c <= 'Z')) ||
               ((_c >= '0') && (_c <= '9')) ||
               (_c === '_') ) );
}

function is_identifier(
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
        if (!is_name_char(_text[i]))
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
            is_space(_text[start]) )
    {
        ++start;
    }

    while ( (end > start) &&
            is_space(_text[end - 1]) )
    {
        --end;
    }

    return { text: _text.slice(start, end), start: start };
}

function at_depth(
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
decl_of
  The declaration of a variable's id, as a frame sees it; null for an id it
does not see.
*/
function decl_of(
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

    const frame = at_depth(_env, _var >>> DEPTH_SHIFT);
    const index = _var & LOCAL;

    return ( (frame !== null) &&
             (index < frame.vars.length) ) ? frame.vars[index] : null;
}

function scope_ok(
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

    const frame = at_depth(_env, _scope >>> DEPTH_SHIFT);
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
    if (!is_env(_env))
    {
        return { status: STATUS.INVALID_ARGUMENT, decl: null };
    }

    const decl = decl_of(_env, _var);

    if ( (decl === null) ||
         !scope_ok(_env, _scope) )
    {
        return { status: STATUS.KEY_ABSENT, decl: null };
    }

    return { status: STATUS.OK, decl: decl };
}

function source_ok(
    _source
)
{
    return ( Number.isInteger(_source)   &&
             (_source > SOURCE.DEFAULT)  &&
             (_source < SOURCES) );
}

const ENV_MARK = Symbol('option_env');

function is_env(
    _env
)
{
    return ( (_env !== null)            &&
             (typeof _env === 'object') &&
             (_env[ENV_MARK] === true) );
}

function make_id(
    _depth,
    _index
)
{
    return ((_depth << DEPTH_SHIFT) | _index) >>> 0;
}

function cell_key(
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
compact_text
  The count of the texts still bound, each once; the generation moves.
*/
function compact_text(
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
            mark += cell.text.bytes.length + 1;
        }
    }

    _env.text_used = mark;
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
    if (_env.text_capacity - _env.text_used <= _size)
    {
        compact_text(_env);

        if (_env.text_capacity - _env.text_used <= _size)
        {
            return false;
        }
    }

    _env.text_used += _size + 1;

    return true;
}


//==============================================================================
// 2.  SETTING UP
//==============================================================================

/**
 * A frame. Made by `init`; its members are the machine's own, and are read
 * through the functions here.
 *
 * @typedef {object} option_env
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
 * @param {number} [_room.text=Infinity]      bytes of text it keeps
 *        copies of, each with a terminator, as the reference counts them.
 * @returns {option_env} the frame.
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
            throw new TypeError('option_env.init: ' + _what +
                                ' is not a count');
        }

        return (_value === undefined) ? Infinity : _value;
    };

    return {
        [ENV_MARK]:       true,
        parent:           null,
        vars:             [],
        scopes:           [],
        name:             null,
        cells:            new Map(),
        binding_capacity: count(_room.bindings, 'bindings'),
        var_capacity:     Math.min(count(_room.vars, 'vars'), LOCAL),
        text_capacity:    count(_room.text, 'text'),
        text_used:        0,
        generation:       0,
        depth:            0,
        child_count:      0
    };
}

/*
normal_names
  A row's named values as the machine holds them: null for none given.
*/
function normal_names(
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
        throw new TypeError('option_env.declare: ' + _what +
                            ' is not an array');
    }

    const count = (_count === undefined) ? _names.length
                                         : Math.min(_count, _names.length);

    return _names.slice(0, count).map((_name) => ({
        name:  to_bytes(_name.name, 'a named value\'s name'),
        value: to_int64(_name.value, 'a named value')
    }));
}

/*
normalize
  A caller's row as the machine holds it: text as bytes, integers as
BigInt, and every member the reference's struct has.
*/
function normalize(
    _row
)
{
    if ( (_row === null) ||
         (typeof _row !== 'object') )
    {
        throw new TypeError('option_env.declare: the row is not an object');
    }

    const names   = normal_names(_row.names, _row.name_count, 'names');
    const unbuilt = normal_names(_row.unbuilt, _row.unbuilt_count,
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
        const read = read_real(_row.real);

        if (read.length !== _row.real.length)
        {
            throw new TypeError('option_env.declare: real is not a real');
        }

        real = read.value;
    }
    else if (typeof _row.real === 'number')
    {
        real = _row.real;
    }
    else if (_row.real !== undefined)
    {
        throw new TypeError('option_env.declare: real is not a number');
    }

    return {
        row:           _row,
        name:          to_bytes(_row.name, 'name'),
        help:          to_bytes(_row.help, 'help'),
        alias:         to_bytes(_row.alias, 'alias'),
        knob:          to_bytes(_row.knob, 'knob'),
        names:         names,
        unbuilt:       unbuilt,
        text:          to_bytes(_row.text, 'text'),
        integer:       to_int64(_row.integer ?? 0, 'integer'),
        minimum:       to_int64(_row.minimum ?? INT64_MIN, 'minimum'),
        maximum:       to_int64(_row.maximum ?? INT64_MAX, 'maximum'),
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
is_exact
  Whether every integer a row can hold lies within the exact integers of a
double: whether its values are handed out as numbers.
*/
function is_exact(
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

function is_named(
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

function well_formed(
    _decl
)
{
    if ( !is_identifier(_decl.name)                    ||
         ( (_decl.alias !== null) &&
           !is_identifier(_decl.alias) )               ||
         !Number.isInteger(_decl.kind)                 ||
         (_decl.kind < KIND.BOOL)                      ||
         (_decl.kind > KIND.FLAGS)                     ||
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
                     is_named(_decl, _decl.integer) );

        case KIND.CHOICE:
            return is_named(_decl, _decl.integer);

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
 * @param {option_env} _env  the frame.
 * @param {option_row} _row  the row; kept, and what `var_at` gives.
 * @returns {option_result} the variable's id; INVALID_ARGUMENT for a row
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
    if ( !is_env(_env)     ||
         (_row === null)   ||
         (_row === undefined) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const decl = normalize(_row);

    if (!well_formed(decl))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if ( declares(_env, decl.name) ||
         declares(_env, decl.alias) )
    {
        return fail(STATUS.KEY_DUPLICATE);
    }

    if (_env.vars.length >= _env.var_capacity)
    {
        return fail(STATUS.CAPACITY);
    }

    decl.exact = is_exact(decl);
    _env.vars.push(decl);
    ++_env.generation;

    return ok(make_id(_env.depth, _env.vars.length - 1));
}

/**
 * Declares each row of a table, stopping at the first the frame refuses.
 *
 * @param {option_env}        _env   the frame.
 * @param {Array<option_row>} _rows  the rows.
 * @returns {option_result} the id of the first, or the refusal.
 */
export function declare_all(
    _env,
    _rows
)
{
    if ( !is_env(_env) ||
         !Array.isArray(_rows) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const first = make_id(_env.depth, _env.vars.length);

    for (const row of _rows)
    {
        const result = declare(_env, row);

        if (!result.is_ok)
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
 * @param {option_env}    _env    the frame.
 * @param {Array<string>} _names  the scopes' names, in order.
 * @returns {option_result} the id of the first.
 */
export function set_scopes(
    _env,
    _names
)
{
    if ( !is_env(_env)          ||
         !Array.isArray(_names) ||
         (_names.length > LOCAL) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    _env.scopes = _names.map((_name) => to_bytes(_name, 'a scope\'s name'));
    ++_env.generation;

    return ok(make_id(_env.depth, 1));
}

/**
 * Puts a frame under a parent, or under none. Its bindings are dropped: a
 * binding's key carries its variable's depth, which this changes.
 *
 * @param {option_env}  _env     the frame; one with no children.
 * @param {?option_env} _parent  the parent, or null.
 * @returns {option_result} INVALID_ARGUMENT for a frame with children or
 *          a parent that is the frame or under it; CAPACITY for a parent
 *          at the greatest depth.
 */
export function set_parent(
    _env,
    _parent
)
{
    _parent = _parent ?? null;

    if ( !is_env(_env)           ||
         (_env.child_count !== 0) ||
         ( (_parent !== null) &&
           !is_env(_parent) ) )
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
        --_env.parent.child_count;
    }

    if (_parent !== null)
    {
        ++_parent.child_count;
    }

    _env.cells.clear();
    _env.text_used  = 0;
    _env.parent     = _parent;
    _env.depth      = (_parent !== null) ? (_parent.depth + 1) : 0;
    _env.generation = (before + 1) >>> 0;

    return ok(0);
}

/**
 * Names a frame: what qualifies its variables, as in "printer.style".
 *
 * @param {option_env} _env   the frame.
 * @param {?string}    _name  an identifier, or null for no name.
 * @returns {option_result}
 */
export function set_name(
    _env,
    _name
)
{
    const name = to_bytes(_name, 'the name');

    if ( !is_env(_env) ||
         ( (name !== null) &&
           !is_identifier(name) ) )
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
 * @param {option_env} _env  the frame.
 */
export function clear(
    _env
)
{
    if (is_env(_env))
    {
        _env.cells.clear();
        _env.text_used = 0;
        ++_env.generation;
    }

    return;
}

/**
 * Takes a frame from under its parent.
 *
 * @param {option_env} _env  the frame.
 */
export function detach(
    _env
)
{
    if ( is_env(_env) &&
         (_env.parent !== null) )
    {
        set_parent(_env, null);
    }

    return;
}

/**
 * A count that moves whenever what a frame sees may have changed: its own
 * and its ancestors', summed.
 *
 * @param {?option_env} _env  the frame.
 * @returns {number} the count, of 32 bits.
 */
export function generation(
    _env
)
{
    let total = 0;

    for (let f = is_env(_env) ? _env : null; f !== null; f = f.parent)
    {
        total = (total + f.generation) >>> 0;
    }

    return total;
}

/**
 * The frame at the top of a frame's chain.
 *
 * @param {?option_env} _env  the frame.
 * @returns {?option_env} the root; null for no frame.
 */
export function root(
    _env
)
{
    if (!is_env(_env))
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
 * holds its name in bytes, so this hands it out.
 *
 * @param {?option_env} _env  the frame.
 * @returns {?string} the name; null for none, and for no frame.
 */
export function name(
    _env
)
{
    return ( is_env(_env) &&
             (_env.name !== null) ) ? decode(_env.name) : null;
}


//==============================================================================
// 3.  FINDING
//==============================================================================

// 3.1
/**
 * How many variables a frame sees: its own and its ancestors'.
 *
 * @param {?option_env} _env  the frame.
 * @returns {number} the count.
 */
export function var_count(
    _env
)
{
    let count = 0;

    for (let f = is_env(_env) ? _env : null; f !== null; f = f.parent)
    {
        count += f.vars.length;
    }

    return count;
}

/**
 * The id of the variable at a place among those a frame sees, the root's
 * first.
 *
 * @param {?option_env} _env    the frame.
 * @param {number}      _index  the place, from 0.
 * @returns {number} the id; NONE past the last.
 */
export function var_id(
    _env,
    _index
)
{
    let total = var_count(_env);

    for (let f = is_env(_env) ? _env : null; f !== null; f = f.parent)
    {
        const base = total - f.vars.length;

        if (_index >= total)
        {
            return NONE;
        }

        if (_index >= base)
        {
            return make_id(f.depth, _index - base);
        }

        total = base;
    }

    return NONE;
}

/**
 * A variable's place among those a frame sees: `var_id`'s inverse.
 *
 * @param {?option_env} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {number} the place; NONE for an id the frame does not see.
 */
export function var_index(
    _env,
    _var
)
{
    if ( !is_env(_env) ||
         (decl_of(_env, _var) === null) )
    {
        return NONE;
    }

    const frame = at_depth(_env, _var >>> DEPTH_SHIFT);

    return var_count(frame.parent) + (_var & LOCAL);
}

/**
 * A variable's row: the object it was declared from.
 *
 * @param {?option_env} _env  the frame.
 * @param {number}      _var  the variable's id.
 * @returns {?option_row} the row; null for an id the frame does not see.
 */
export function var_at(
    _env,
    _var
)
{
    const decl = is_env(_env) ? decl_of(_env, _var) : null;

    return (decl !== null) ? decl.row : null;
}

/**
 * The frame that declares a variable.
 *
 * @param {?option_env} _env  a frame that sees it.
 * @param {number}      _var  the variable's id.
 * @returns {?option_env} the frame; null for an id `_env` does not see.
 */
export function var_frame(
    _env,
    _var
)
{
    if ( !is_env(_env) ||
         (decl_of(_env, _var) === null) )
    {
        return null;
    }

    return at_depth(_env, _var >>> DEPTH_SHIFT);
}

function scope_name_bytes(
    _env,
    _scope
)
{
    if ( !is_env(_env)     ||
         (_scope === GLOBAL) ||
         !scope_ok(_env, _scope) )
    {
        return null;
    }

    return at_depth(_env, _scope >>> DEPTH_SHIFT)
               .scopes[(_scope & LOCAL) - 1];
}

// 3.2
/**
 * A scope's name.
 *
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id.
 * @returns {?string} the name; null for GLOBAL or an id the frame does not
 *          see.
 */
export function scope_name(
    _env,
    _scope
)
{
    const name = scope_name_bytes(_env, _scope);

    return (name !== null) ? decode(name) : null;
}

function find_bytes(
    _env,
    _name
)
{
    if ( !is_env(_env) ||
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
                return ok(make_id(f.depth, i));
            }
        }
    }

    return fail(STATUS.KEY_ABSENT);
}

/**
 * The variable of a name or an alias, the innermost frame's first.
 *
 * @param {?option_env} _env   the frame.
 * @param {string}      _name  the name, with no frame or scope before it.
 * @returns {option_result} the id, or KEY_ABSENT.
 */
export function find(
    _env,
    _name
)
{
    return find_bytes(_env, to_bytes(_name, 'the name'));
}

function find_scope_bytes(
    _env,
    _name
)
{
    if ( !is_env(_env) ||
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
                return ok(make_id(f.depth, i + 1));
            }
        }
    }

    return fail(STATUS.KEY_ABSENT);
}

/**
 * The scope of a name, the innermost frame's first.
 *
 * @param {?option_env} _env   the frame.
 * @param {string}      _name  the scope's name.
 * @returns {option_result} the id, or KEY_ABSENT.
 */
export function find_scope(
    _env,
    _name
)
{
    return find_scope_bytes(_env, to_bytes(_name, 'the name'));
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

function resolve_bytes(
    _env,
    _name
)
{
    if ( !is_env(_env) ||
         (_name === null) )
    {
        return { ...fail(STATUS.INVALID_ARGUMENT), scope: GLOBAL };
    }

    const name = unqualify(_env, _name);
    const dot  = name.indexOf('.');

    if (dot < 0)
    {
        return { ...find_bytes(_env, name), scope: GLOBAL };
    }

    const scope = find_scope_bytes(_env, name.slice(0, dot));

    if (!scope.is_ok)
    {
        return { ...scope, scope: GLOBAL };
    }

    return { ...find_bytes(_env, name.slice(dot + 1)), scope: scope.value };
}

/**
 * The variable and the scope a written name means: "name", "scope.name",
 * and either after the frame's own name and a point.
 *
 * @param {?option_env} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {option_result & {scope: number}} the variable's id, and in
 *          `scope` the scope's, GLOBAL where none is written; KEY_ABSENT
 *          for a scope or a variable the frame does not see.
 */
export function resolve(
    _env,
    _name
)
{
    return resolve_bytes(_env, to_bytes(_name, 'the name'));
}

function distance_bytes(
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
            const far  = (name !== null) ? distance_bytes(name, _text) : 9;

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
 * @returns {number} the distance; 9 where either is longer than 63 bytes.
 */
export function distance(
    _name,
    _text
)
{
    const name = to_bytes(_name, 'the name');
    const text = to_bytes(_text, 'the text');

    if ( (name === null) ||
         (text === null) )
    {
        return 9;
    }

    return distance_bytes(cstr(name), text);
}

function suggest_bytes(
    _env,
    _name
)
{
    if ( !is_env(_env) ||
         (_name === null) )
    {
        return null;
    }

    let   name = unqualify(_env, _name);
    const dot  = name.indexOf('.');

    if ( (dot >= 0) &&
         !find_scope_bytes(_env, name.slice(0, dot)).is_ok )
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
 * @param {?option_env} _env   the frame.
 * @param {string}      _name  the name as written.
 * @returns {?string} the name, bare; null where none is near.
 */
export function suggest(
    _env,
    _name
)
{
    const name = suggest_bytes(_env, to_bytes(_name, 'the name'));

    return (name !== null) ? decode(name) : null;
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
            _value.text = (_cell.text !== null) ? _cell.text.bytes : null;
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
    _a_depth,
    _b,
    _b_depth
)
{
    if (_a.source !== _b.source)
    {
        return (_a.source > _b.source);
    }

    if (_a_depth !== _b_depth)
    {
        return (_a_depth > _b_depth);
    }

    return ( (_a.scope !== GLOBAL) &&
             (_b.scope === GLOBAL) );
}

function in_force(
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

function default_value(
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
name_value
  For a CHOICE or an INT, the value's name as its text, or none.
*/
function name_value(
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

/*
get_bytes
  d_option_env_get, its value's text in bytes and its integer a BigInt.
*/
function get_bytes(
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

    const { cell, frame } = in_force(_env, _scope, _var);
    const value           = default_value(decl);

    if (cell !== null)
    {
        read(frame, cell, value);
    }

    name_value(decl, value);

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
        text:         (_value.text !== null) ? decode(_value.text) : null,
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
 * @typedef {object} option_value
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
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {option_result & {got?: option_value}} the id, and in `got`
 *          the value; KEY_ABSENT for an id the frame does not see.
 */
export function get(
    _env,
    _scope,
    _var
)
{
    const result = get_bytes(_env, _scope, _var);

    return result.is_ok ? { ...ok(_var),
                            got: handed(result.decl, result.got) }
                        : result;
}

/**
 * A BOOL's value in force; false for anything else.
 *
 * @param {?option_env} _env    the frame.
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
    const result = get_bytes(_env, _scope, _var);

    return ( result.is_ok                     &&
             (result.got.kind === KIND.BOOL)  &&
             (result.got.integer !== 0n) );
}

/**
 * The value in force of an INT, a CHOICE or FLAGS; 0 for anything else.
 *
 * @param {?option_env} _env    the frame.
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
    const result = get_bytes(_env, _scope, _var);

    if ( !result.is_ok                    ||
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
 * @param {?option_env} _env    the frame.
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
    const result = get_bytes(_env, _scope, _var);

    return ( result.is_ok &&
             (result.got.kind === KIND.REAL) ) ? result.got.real : 0;
}

/**
 * A TEXT's value in force, or the name of a CHOICE's or an INT's; null for
 * anything else, and for a value with no text.
 *
 * @param {?option_env} _env    the frame.
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
    const result = get_bytes(_env, _scope, _var);

    return ( result.is_ok &&
             ( (result.got.kind === KIND.TEXT)   ||
               (result.got.kind === KIND.CHOICE) ||
               (result.got.kind === KIND.INT) )  &&
             (result.got.text !== null) ) ? decode(result.got.text) : null;
}

/**
 * The source of the value in force.
 *
 * @param {?option_env} _env    the frame.
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
    const result = get_bytes(_env, _scope, _var);

    return result.is_ok ? result.got.source : -1;
}

// 4.2
/**
 * Whether a frame itself binds a variable in exactly a scope, from any
 * source.
 *
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {boolean}
 */
export function is_bound(
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
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @returns {boolean}
 */
export function scope_is_bound(
    _env,
    _scope
)
{
    for (let f = is_env(_env) ? _env : null; f !== null; f = f.parent)
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
layers_bytes
  d_option_env_layers, each layer's value in bytes; null for the
reference's (size_t)-1.
*/
function layers_bytes(
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
                            value: default_value(decl) };

            read(f, cell, layer.value);
            name_value(decl, layer.value);

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
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {number}      [_capacity=64]  the most layers to give; the
 *        reference gives at most 64.
 * @returns {{count: number, layers: Array<{frame: option_env,
 *            scope: number, shown: boolean, value: option_value}>}}
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
    const found = layers_bytes(_env, _scope, _var, _capacity);

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
             is_named(_decl, _integer) )
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

    if (!source_ok(_source))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    // a source the row refuses fails by name, as an unbuilt value does
    if ((decl.refused & refuses(_source)) !== 0)
    {
        return fail(STATUS.POLICY_REJECTED);
    }

    const key = cell_key(_scope, _source, _var);

    if ( !_env.cells.has(key) &&
         (_env.cells.size >= _env.binding_capacity) )
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

function bind_int(
    _env,
    _scope,
    _var,
    _source,
    _integer
)
{
    const decl = is_env(_env) ? decl_of(_env, _var) : null;

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
    return (_text !== null) ? { bytes: cstr(_text), arena: false } : null;
}

// 5.1
/**
 * Binds a BOOL, as the program.
 *
 * @param {option_env} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {boolean}    _value  the value.
 * @returns {option_result} the id; VALUE_TYPE_MISMATCH for a variable of
 *          another kind; POLICY_REJECTED for a row that refuses the
 *          program; CAPACITY for a frame that is full.
 */
export function set_bool(
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
 * @param {option_env} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number|bigint} _value  the value; a number must be a whole one
 *        that is exact.
 * @returns {option_result} the id; INVALID_ARGUMENT for a value the row
 *          does not accept; POLICY_REJECTED for one that is named and not
 *          built.
 */
export function set_int(
    _env,
    _scope,
    _var,
    _value
)
{
    return bind_int(_env, _scope, _var, SOURCE.PROGRAM,
                    to_int64(_value, 'the value'));
}

/**
 * Binds a REAL, as the program.
 *
 * @param {option_env} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {number}     _value  the value.
 * @returns {option_result} the id.
 */
export function set_real(
    _env,
    _scope,
    _var,
    _value
)
{
    if (typeof _value !== 'number')
    {
        throw new TypeError('option_env.set_real: the value is not a ' +
                            'number');
    }

    return bind(_env, _scope, _var, SOURCE.PROGRAM, KIND.REAL,
                { real: _value });
}

/**
 * Binds a TEXT, as the program. The reference keeps the caller's pointer
 * and counts none of the frame's text room; so does this.
 *
 * @param {option_env} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {?string}    _value  the text, or null.
 * @returns {option_result} the id.
 */
export function set_text(
    _env,
    _scope,
    _var,
    _value
)
{
    return bind(_env, _scope, _var, SOURCE.PROGRAM, KIND.TEXT,
                { text: borrowed(to_bytes(_value, 'the value')) });
}

function set_value_bytes(
    _env,
    _scope,
    _var,
    _source,
    _value
)
{
    if ( (_value === null)      ||
         (_value === undefined) ||
         !source_ok(_source) )
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
            return bind_int(_env, _scope, _var, _source, _value.integer);

        default:
            return fail(STATUS.VALUE_TYPE_MISMATCH);
    }
}

/**
 * Binds a variable to a value, from a source.
 *
 * @param {option_env} _env     the frame the binding is made in.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @param {{kind: number, integer?: (number|bigint|boolean), real?: number,
 *          text?: ?string}} _value  the value: its
 *        kind, and the member that kind reads.
 * @returns {option_result} the id; INVALID_ARGUMENT for no value or a
 *          source that is none; VALUE_TYPE_MISMATCH for a kind that is not
 *          the variable's.
 */
export function set_value(
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

    return set_value_bytes(_env, _scope, _var, _source, {
        kind:         _value.kind,
        integer:      to_int64(_value.integer ?? 0, 'the value\'s integer'),
        real:         _value.real ?? 0,
        text:         to_bytes(_value.text, 'the value\'s text')
    });
}

/*
text_copy
  Binds a TEXT to a copy of bytes the frame keeps.
*/
function text_copy(
    _env,
    _scope,
    _var,
    _value,
    _source
)
{
    if (!source_ok(_source))
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
                { text: { bytes: cstr(_value), arena: true } });
}

/**
 * Binds a TEXT to a copy of a text, as the program: the copy counts
 * against the frame's text room.
 *
 * @param {option_env} _env    the frame the binding is made in.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @param {string}     _value  the text.
 * @returns {option_result} the id; BUFFER_TOO_SMALL for a frame with no
 *          room for it.
 */
export function set_text_copy(
    _env,
    _scope,
    _var,
    _value
)
{
    return text_copy(_env, _scope, _var, to_bytes(_value, 'the value') ?? '',
                     SOURCE.PROGRAM);
}

// 5.2
/**
 * Drops a frame's own bindings of a variable in exactly a scope, from
 * every source.
 *
 * @param {option_env} _env    the frame.
 * @param {number}     _scope  the scope's id, or GLOBAL.
 * @param {number}     _var    the variable's id.
 * @returns {option_result} the id, whether or not anything was bound.
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
        removed = _env.cells.delete(cell_key(_scope, from, _var)) || removed;
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
 * @param {option_env} _env     the frame.
 * @param {number}     _scope   the scope's id, or GLOBAL.
 * @param {number}     _var     the variable's id.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {option_result} the id, whether or not anything was bound.
 */
export function unset_from(
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

    if (!source_ok(_source))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    if (_env.cells.delete(cell_key(_scope, _source, _var)))
    {
        ++_env.generation;
    }

    return ok(_var);
}


//==============================================================================
// 6.  BINDING FROM TEXT
//==============================================================================

const YES = ['1', 'true', 'yes', 'on', 'y'];
const NO  = ['0', 'false', 'no', 'off', 'n'];

function read_bool(
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
read_int
  A 64-bit integer from a text: a sign, a base prefix 0x, 0o or 0b, and
digits; null for anything else, and for a value that does not fit.
*/
function read_int(
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
read_real_text
  A real from a text, whole: C's alphabet, or one of the words, and what
strtod makes of it; null for anything else, and for a value past the
largest double.
*/
function read_real_text(
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

    const read = read_real(_text);

    if ( (read.length !== size) ||
         read.overflow )
    {
        return null;
    }

    return read;
}

function names_value(
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
read_choice
  A named value by its name, without regard to case, or a number: for a
CHOICE, an INT, and each term of FLAGS.
*/
function read_choice(
    _decl,
    _text
)
{
    let value = names_value(_decl.names, _decl.name_count, _text);

    if (value !== null)
    {
        return { status: STATUS.OK, value: value };
    }

    value = names_value(_decl.unbuilt, _decl.unbuilt_count, _text);

    if (value !== null)
    {
        return { status: STATUS.POLICY_REJECTED, value: value };
    }

    value = read_int(_text);

    return (value !== null) ? { status: STATUS.OK, value: value }
                            : { status: STATUS.INVALID_ARGUMENT, value: 0n };
}

/*
read_flags
  Flags from terms separated by ',', '|' or space. A text that starts with
a sign edits the value in force: "+name" sets bits and "-name" clears them.
*/
function read_flags(
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
        const now = get_bytes(_env, _scope, _var);

        value = now.is_ok ? now.got.integer : 0n;
    }

    while (at < size)
    {
        let sign = '+';

        // skip separators, then one term
        while ( (at < size) &&
                ( (_text[at] === ',') ||
                  (_text[at] === '|') ||
                  is_space(_text[at]) ) )
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
                is_name_char(_text[at]) )
        {
            ++at;
        }

        const term = (at === start)
                         ? { status: STATUS.INVALID_ARGUMENT, value: 0n }
                         : read_choice(_decl, _text.slice(start, at));

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
assign_value
  Binds a variable from a value's text, read as its kind reads one.
*/
function assign_value(
    _env,
    _scope,
    _var,
    _value,
    _source
)
{
    const decl = decl_of(_env, _var);

    if (decl.kind === KIND.TEXT)
    {
        return text_copy(_env, _scope, _var, _value, _source);
    }

    const value  = default_value(decl);
    const text_  = trim(_value).text;
    let   status = STATUS.OK;
    let   read_;

    switch (decl.kind)
    {
        case KIND.BOOL:
            read_         = read_bool(text_);
            status        = (read_ !== null) ? STATUS.OK
                                             : STATUS.INVALID_ARGUMENT;
            value.integer = read_ ?? 0n;
            break;

        case KIND.REAL:
            read_  = read_real_text(text_);
            status = (read_ !== null) ? STATUS.OK : STATUS.INVALID_ARGUMENT;

            if (read_ !== null)
            {
                value.real = read_.value;
            }
            break;

        case KIND.INT:
        case KIND.CHOICE:
            // a number, or one of the row's named values by its name
            read_         = read_choice(decl, text_);
            status        = read_.status;
            value.integer = read_.value;
            break;

        default:
            read_         = read_flags(_env, _scope, _var, decl, text_);
            status        = read_.status;
            value.integer = read_.value;
            break;
    }

    // a value read from text is not a text the binding borrows
    value.text = null;

    return (status === STATUS.OK)
               ? set_value_bytes(_env, _scope, _var, _source, value)
               : fail(status);
}

function assign_from_bytes(
    _env,
    _name,
    _value,
    _source
)
{
    if ( !is_env(_env)    ||
         (_name === null) ||
         (_value === null) ||
         !source_ok(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const found = resolve_bytes(_env, _name);

    if (!found.is_ok)
    {
        return fail(found.error);
    }

    return assign_value(_env, found.scope, found.value, _value, _source);
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
 * @param {option_env} _env     the frame the binding is made in.
 * @param {string}     _name    the name: "name" or "scope.name", perhaps
 *        after the frame's own name and a point.
 * @param {string}     _value   the value's text.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {option_result} the variable's id; KEY_ABSENT for a name the
 *          frame does not see; INVALID_ARGUMENT for a text that is not a
 *          value of the kind, or one the row does not accept;
 *          POLICY_REJECTED for a named value that is not built, or a
 *          source the row refuses.
 */
export function assign_from(
    _env,
    _name,
    _value,
    _source
)
{
    return assign_from_bytes(_env, to_bytes(_name, 'the name'),
                             to_bytes(_value, 'the value') ?? '', _source);
}

/**
 * `assign_from`, as the program.
 *
 * @param {option_env} _env    the frame the binding is made in.
 * @param {string}     _name   the name as written.
 * @param {string}     _value  the value's text.
 * @returns {option_result}
 */
export function assign(
    _env,
    _name,
    _value
)
{
    return assign_from(_env, _name, _value, SOURCE.PROGRAM);
}

/*
escape
  One escape of a quoted value, after its backslash: the byte it stands
for, and how far it reached; null for one that is none.
*/
function escape(
    _text,
    _at
)
{
    switch (_text[_at])
    {
        case '"':  return { byte: '"', at: _at };
        case '\\': return { byte: '\\', at: _at };
        case '\'': return { byte: '\'', at: _at };
        case 'n':  return { byte: '\n', at: _at };
        case 'r':  return { byte: '\r', at: _at };
        case 't':  return { byte: '\t', at: _at };
        case '0':  return { byte: '\0', at: _at };
        case 'x':  break;
        default:   return null;
    }

    // x: exactly two hexadecimal digits
    if (_at + 2 >= _text.length)
    {
        return null;
    }

    const code = read_int('0x' + _text[_at + 1] + _text[_at + 2]);

    if (code === null)
    {
        return null;
    }

    return { byte: String.fromCharCode(Number(code) & 0xFF), at: _at + 2 };
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

            c = read_.byte;
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
    const decl = decl_of(_env, _var);

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
                    { text: { bytes: cstr(plain), arena: true } });
    }

    const plain = (_text.length > SCRATCH) ? null : unescape(_text);

    if (plain === null)
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    return assign_value(_env, _scope, _var, plain, _source);
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
            return unset_from(_env, _scope, _var, _source);
        }

        return (decl_of(_env, _var).kind === KIND.BOOL)
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
              is_space(_text[at]) );

    // an unquoted value is the rest; a quoted one must end the statement
    if ( (at === size) ||
         (_text[at] !== '"') )
    {
        return assign_value(_env, _scope, _var, _text.slice(at), _source);
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
            ( is_name_char(text_[at]) ||
              (text_[at] === '.') ) )
    {
        ++at;
    }

    const found = resolve_bytes(_env, text_.slice(unset_, at));

    while ( (at < size) &&
            is_space(text_[at]) )
    {
        ++at;
    }

    if (!found.is_ok)
    {
        return (at === unset_) ? fail(STATUS.INVALID_ARGUMENT)
                               : fail(found.error);
    }

    return act(_env, text_, at, (unset_ !== 0), found.scope, found.value,
               _source);
}

function put_n_from_bytes(
    _env,
    _statement,
    _source
)
{
    if ( !is_env(_env)          ||
         (_statement === null)  ||
         !source_ok(_source) )
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
 * @param {option_env} _env        the frame.
 * @param {string}     _statement  the statement; read up to a NUL.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {option_result} the variable's id; INVALID_ARGUMENT for a
 *          statement with no name, with text after a bare name, or with a
 *          value the variable refuses; KEY_ABSENT for a name the frame
 *          does not see.
 */
export function put_from(
    _env,
    _statement,
    _source
)
{
    const text_ = to_bytes(_statement, 'the statement');

    return put_n_from_bytes(_env, (text_ !== null) ? cstr(text_) : null,
                            _source);
}

/**
 * `put_from`, as the program.
 *
 * @param {option_env} _env        the frame.
 * @param {string}     _statement  the statement.
 * @returns {option_result}
 */
export function put(
    _env,
    _statement
)
{
    return put_from(_env, _statement, SOURCE.PROGRAM);
}

/**
 * `put_from` for a statement given whole, a NUL in it included: the
 * reference's form for text that carries its length.
 *
 * @param {option_env} _env        the frame.
 * @param {string}     _statement  the statement.
 * @param {number}     _source     the source; any but DEFAULT.
 * @returns {option_result}
 */
export function put_n_from(
    _env,
    _statement,
    _source
)
{
    return put_n_from_bytes(_env, to_bytes(_statement, 'the statement') ?? '',
                            _source);
}

function statement_end_bytes(
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
 * @param {number} _at      where the statement starts, in bytes of the
 *        script's UTF-8 (src/text/utf8.js, `byte_offset`).
 * @returns {number} the offset of its end, in bytes.
 */
export function statement_end(
    _script,
    _at
)
{
    const script = to_bytes(_script, 'the script');

    return (script !== null) ? statement_end_bytes(cstr(script), _at) : _at;
}

function load_from_bytes(
    _env,
    _script,
    _source
)
{
    let at    = 0;
    let count = 0;

    if ( !is_env(_env)       ||
         (_script === null)  ||
         !source_ok(_source) )
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const size = _script.length;

    while (at < size)
    {
        const start = at;

        at = statement_end_bytes(_script, at);

        const trimmed = trim(_script.slice(start, at));

        if (trimmed.text.length > 0)
        {
            const result = statement(_env, trimmed.text, _source);

            if (!result.is_ok)
            {
                return { ...result, error_offset: start + trimmed.start };
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
 * @param {option_env} _env     the frame.
 * @param {string}     _script  the script; read up to a NUL.
 * @param {number}     _source  the source; any but DEFAULT.
 * @returns {option_result & {error_offset?: number}} how many statements
 *          were carried out; or the refusal, with in `error_offset` where
 *          the refused statement starts, in bytes of the script's UTF-8,
 *          as the reference reports it (src/text/utf8.js, `string_index`,
 *          gives the index into the string).
 */
export function load_from(
    _env,
    _script,
    _source
)
{
    const script = to_bytes(_script, 'the script');

    return load_from_bytes(_env, (script !== null) ? cstr(script) : null,
                           _source);
}

/**
 * `load_from`, as the program.
 *
 * @param {option_env} _env     the frame.
 * @param {string}     _script  the script.
 * @returns {option_result & {error_offset?: number}}
 */
export function load(
    _env,
    _script
)
{
    return load_from(_env, _script, SOURCE.PROGRAM);
}

/*
lookup_of
  An environment as a function from a variable's name in bytes to its value
in bytes, or null: from a Map, an object or a function of strings.
*/
function lookup_of(
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
        const value = ask(decode(_key));

        return (typeof value === 'string') ? cstr(encode(value)) : null;
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

function import_bytes(
    _env,
    _prefix,
    _lookup
)
{
    let failure = ok(0);
    let count   = 0;

    if (!is_env(_env))
    {
        return fail(STATUS.INVALID_ARGUMENT);
    }

    const total = var_count(_env);

    for (let k = 0; k < total; ++k)
    {
        const id   = var_id(_env, k);
        const decl = decl_of(_env, id);
        const seen = find_bytes(_env, decl.name);
        let   value = getenv(_lookup, _prefix, decl.name);

        // a variable an inner frame's hides is not read
        if ( !seen.is_ok ||
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
            const result = assign_value(_env, GLOBAL, id, value,
                                        SOURCE.ENVIRONMENT);

            if (result.is_ok)
            {
                ++count;
            }
            else if (failure.is_ok)
            {
                failure = result;
            }
        }
    }

    return failure.is_ok ? ok(count) : failure;
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
 * Exported as `import` too, the reference's name: `option_env.import(...)`.
 *
 * @param {option_env} _env     the frame.
 * @param {?string}    _prefix  what each variable's name follows, or null
 *        for nothing.
 * @param {Map<string, string>|Record<string, string>|
 *         function(string): (string|undefined)} _environment  the
 *        environment: names to values.
 * @returns {option_result} how many were bound; or the first refusal.
 */
export function import_(
    _env,
    _prefix,
    _environment
)
{
    return import_bytes(_env, cstr(to_bytes(_prefix, 'the prefix') ?? ''),
                        lookup_of(_environment));
}

export { import_ as import };


//==============================================================================
// 7.  WRITING TEXT
//==============================================================================

/*
widest
  The row's name whose bits are all still to be written and are the most;
-1 for none.
*/
function widest(
    _decl,
    _left
)
{
    let best       = -1;
    let best_count = 0;

    for (let i = 0; i < _decl.name_count; ++i)
    {
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

        if (count > best_count)
        {
            best       = i;
            best_count = count;
        }
    }

    return best;
}

function format_flags(
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

function format_value(
    _decl,
    _value
)
{
    switch (_value.kind)
    {
        case KIND.BOOL:
            return (_value.integer !== 0n) ? 'true' : 'false';

        case KIND.REAL:
            return format_real(_value.real);

        case KIND.TEXT:
            return (_value.text !== null) ? _value.text : '';

        case KIND.FLAGS:
            return format_flags(_decl, _value.integer);

        default:
            // INT and CHOICE: the value's name where it has one, else its
            // number
            return (_value.text !== null) ? _value.text
                                          : _value.integer.toString();
    }
}

function format_bytes(
    _env,
    _scope,
    _var
)
{
    const result = get_bytes(_env, _scope, _var);

    return result.is_ok ? format_value(result.decl, result.got) : null;
}

function needs_quotes(
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

function append_quoted(
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

function format_quoted_bytes(
    _env,
    _scope,
    _var
)
{
    const result = get_bytes(_env, _scope, _var);

    if ( !result.is_ok                    ||
         (result.got.kind !== KIND.TEXT)  ||
         (result.got.text === null)       ||
         !needs_quotes(result.got.text) )
    {
        return format_bytes(_env, _scope, _var);
    }

    return append_quoted(result.got.text);
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
 * @param {?option_env} _env    the frame.
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
    const out = format_bytes(_env, _scope, _var);

    return (out !== null) ? decode(out) : null;
}

/**
 * `format`, with a TEXT written so that a statement reads it back: in
 * double quotes, with escapes, where it is empty, starts or ends with a
 * space or tab, or holds ';', '#', '"', a backslash or a control
 * character.
 *
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @returns {?string} the text; null for an id the frame does not see.
 */
export function format_quoted(
    _env,
    _scope,
    _var
)
{
    const out = format_quoted_bytes(_env, _scope, _var);

    return (out !== null) ? decode(out) : null;
}


//==============================================================================
// 8.  READING ON A HOT PATH
//==============================================================================

// 8.1
/**
 * The value in force, read again only when the frame's generation has
 * moved since the cache was filled.
 *
 * @param {?option_env} _env    the frame.
 * @param {number}      _scope  the scope's id, or GLOBAL.
 * @param {number}      _var    the variable's id.
 * @param {{filled?: boolean, generation?: number, value?: option_value}}
 *        _cache  the caller's cache for this variable in this scope; an
 *        empty object to start with.
 * @returns {?option_value} the value; one of kind 0 for an id the frame
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

        _cache.value      = result.is_ok
                                ? result.got
                                : { text: null, integer: 0, real: 0, kind: 0,
                                    bound: false, source: 0, depth: 0 };
        _cache.generation = now;
        _cache.filled     = true;
    }

    return _cache.value;
}


//==============================================================================
// 9.  BYTES
//==============================================================================

// 9.1
/**
 * The machine without the change to strings: each takes and gives byte
 * strings (src/text/utf8.js), and integers as BigInt. For the modules that
 * stand on this one and count bytes themselves -- the registry, the djin
 * writers, the program's commands. `decl` gives a variable's row as the
 * machine holds it.
 */
export const bytes = Object.freeze({
    cstr:          cstr,
    decl:          (_env, _var) => (is_env(_env) ? decl_of(_env, _var)
                                                 : null),
    is_identifier: is_identifier,
    find:          find_bytes,
    find_scope:    find_scope_bytes,
    resolve:       resolve_bytes,
    distance:      distance_bytes,
    suggest:       suggest_bytes,
    scope_name:    scope_name_bytes,
    get:           get_bytes,
    layers:        layers_bytes,
    assign_from:   assign_from_bytes,
    put_n_from:    put_n_from_bytes,
    load_from:     load_from_bytes,
    statement_end: statement_end_bytes,
    import:        import_bytes,
    lookup_of:     lookup_of,
    format:        format_bytes,
    format_quoted: format_quoted_bytes,
    format_value:  format_value
});
