/*******************************************************************************
* djinterp.js [interp]                                                   djin.js
*
*   A djin, as a program knows one: a record of its name, version, summary,
* commands and settings; the set of the records a program has taken; and
* the two texts a program shows of them -- the list, a line a djin, and a
* description, a djin's commands and settings in columns.
*   A record is checked before it is taken, and refused by a status: a name
* that is not a lowercase word, a version or summary that is not one line,
* a command named twice, a name the program keeps for itself, a name
* already taken, settings that are another djin's.
*   The texts are the reference's, byte for byte: column widths count
* bytes, as its strlen does.
*   The reference's record carries its own size and an ABI number, because
* a native module is loaded from a file built elsewhere. A record here is
* an object: it has no size, and its `abi` is the current one where left
* out.
*   reference: inc/djinterp/c/modules/interp/djin.h and
*              src/djinterp/c/modules/interp/djin.c, at dfc793c4
*
*
* path:      /src/modules/interp/djin.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  Vocabulary
    1.  ABI, STATUS
    2.  status_name
2.  The set
    1.  set_init
    2.  register
    3.  set_count, set_at, set_find
    4.  command_find
3.  As text
    1.  write_list
    2.  write_description
    3.  write_frame
*/

import data from '../../../generated/option.js';
import { format_real } from '../../text/real_format.js';
import { decode, encode } from '../../text/utf8.js';
import * as option_env from '../../option/option_env.js';
import * as option_env_registry from '../../option/option_env_registry.js';

const DEFAULT_ROOM = 96;
const NAME_ROOM    = 128;
const env_bytes    = option_env.bytes;
const KIND         = option_env.KIND;


//==============================================================================
// 1.  VOCABULARY
//==============================================================================

// 1.1
/** The record's ABI number: D_DJIN_ABI. */
export const ABI = data.djin_abi;

/**
 * What `register` answers, by the reference's names without their prefix.
 */
export const STATUS = Object.freeze({
    OK: 0, INVALID: 1, DUPLICATE: 2, RESERVED: 3, FULL: 4, SETTINGS: 5
});

// 1.2
/**
 * A status's name; "unknown" for a value that is none.
 *
 * @param {number} _status  the status.
 * @returns {string} the name.
 */
export function status_name(
    _status
)
{
    return ( !Number.isInteger(_status) ||
             (_status < STATUS.OK)      ||
             (_status > STATUS.SETTINGS) ) ? data.djin_status_unknown
                                           : data.djin_statuses[_status];
}

/**
 * A djin's record: the reference's struct dj_djin, less its size.
 *
 * @typedef {object} djin_record
 * @property {string}  name      a lowercase word: a letter, then letters,
 *           digits and '_'.
 * @property {string}  version   one line, not empty.
 * @property {string}  summary   one line, not empty.
 * @property {?Array<djin_command>} [commands]  its commands.
 * @property {?option_env} [settings]  its settings: a frame named as the
 *           djin is.
 * @property {number}  [abi]     the ABI it was written to; the current
 *           one where left out.
 */

/**
 * A djin's command: the reference's struct dj_djin_command, less its size.
 *
 * @typedef {object} djin_command
 * @property {string}   name     a lowercase word: a letter, then letters,
 *           digits and '-'.
 * @property {string}   summary  one line, not empty.
 * @property {?function} [run]   what carries it out.
 * @property {*}        [context]  what `run` is handed.
 */


//==============================================================================
// CHECKING A RECORD
//==============================================================================

function is_word(
    _text,
    _extra
)
{
    if ( (typeof _text !== 'string') ||
         (_text.length === 0)        ||
         (_text[0] < 'a')            ||
         (_text[0] > 'z') )
    {
        return false;
    }

    for (let i = 1; i < _text.length; ++i)
    {
        const c = _text[i];

        if ( !((c >= 'a') && (c <= 'z')) &&
             !((c >= '0') && (c <= '9')) &&
             (c !== _extra) )
        {
            return false;
        }
    }

    return true;
}

function is_line(
    _text
)
{
    return ( (typeof _text === 'string') &&
             (_text.length !== 0)        &&
             !_text.includes('\n')       &&
             !_text.includes('\r') );
}

/*
bytes_of
  A record's text as the reference holds it: bytes, up to a NUL; what is
not a string is left as it is, to fail its check.
*/
function bytes_of(
    _text
)
{
    return (typeof _text === 'string') ? env_bytes.cstr(encode(_text))
                                       : _text;
}

/*
normal
  A caller's record as the writers and the set hold it: its text in bytes.
*/
function normal(
    _djin
)
{
    return {
        record:   _djin,
        abi:      _djin.abi ?? ABI,
        name:     bytes_of(_djin.name),
        version:  bytes_of(_djin.version),
        summary:  bytes_of(_djin.summary),
        commands: Array.isArray(_djin.commands)
                      ? _djin.commands.map((_command) => ({
                            command: _command,
                            name:    bytes_of(_command?.name),
                            summary: bytes_of(_command?.summary)
                        }))
                      : (_djin.commands ?? []),
        settings: _djin.settings ?? null
    };
}

function commands_valid(
    _djin
)
{
    if (!Array.isArray(_djin.commands))
    {
        return false;
    }

    for (let i = 0; i < _djin.commands.length; ++i)
    {
        const command = _djin.commands[i];

        if ( !is_word(command.name, '-') ||
             !is_line(command.summary) )
        {
            return false;
        }

        for (let j = 0; j < i; ++j)
        {
            if (_djin.commands[j].name === command.name)
            {
                return false;
            }
        }
    }

    return true;
}

function record_valid(
    _djin
)
{
    return ( (_djin.abi === ABI)       &&
             is_word(_djin.name, '_')  &&
             is_line(_djin.version)    &&
             is_line(_djin.summary)    &&
             commands_valid(_djin)     &&
             ( (_djin.settings === null) ||
               ( (_djin.settings.name !== null)      &&
                 (_djin.settings.name !== undefined) &&
                 (_djin.settings.name === _djin.name) ) ) );
}


//==============================================================================
// 2.  THE SET
//==============================================================================

/**
 * A set of records. Made by `set_init`; read through the functions here.
 *
 * @typedef {object} djin_set
 */

// 2.1
/**
 * A set with no records.
 *
 * @param {object} [_options]  what the set is made over.
 * @param {number} [_options.capacity=Infinity]  the most records it
 *        takes.
 * @param {?option_env_registry} [_options.registry=null]  the registry a
 *        record's settings are listed in.
 * @param {Array<string>} [_options.reserved=[]]  the names the program
 *        keeps for itself.
 * @returns {djin_set}
 */
export function set_init(
    _options = {}
)
{
    return {
        items:    [],
        capacity: _options.capacity ?? Infinity,
        registry: _options.registry ?? null,
        reserved: (_options.reserved ?? []).map(bytes_of)
    };
}

function register_settings(
    _set,
    _djin
)
{
    if (_djin.settings === null)
    {
        return STATUS.OK;
    }

    if (_set.registry === null)
    {
        return STATUS.SETTINGS;
    }

    const present = option_env_registry.bytes.find(_set.registry,
                                                   _djin.name);

    if (present !== null)
    {
        return (present === _djin.settings) ? STATUS.OK : STATUS.DUPLICATE;
    }

    return option_env_registry.add(_set.registry, _djin.settings).is_ok
               ? STATUS.OK
               : STATUS.SETTINGS;
}

function find_normal(
    _set,
    _name
)
{
    for (const item of _set.items)
    {
        if (item.name === _name)
        {
            return item;
        }
    }

    return null;
}

// 2.2
/**
 * Takes a record into a set, and lists its settings in the set's
 * registry.
 *
 * @param {djin_set}    _set   the set.
 * @param {djin_record} _djin  the record; kept, and what `set_find` gives.
 * @returns {number} a STATUS: INVALID for a record that is not well
 *          formed; RESERVED for a name the program keeps; DUPLICATE for a
 *          name the set has, or whose settings' name another frame in the
 *          registry has; FULL for a set that is full; SETTINGS for
 *          settings with no registry to list them in, or that the
 *          registry refuses.
 */
export function register(
    _set,
    _djin
)
{
    if ( (_set === null)             ||
         (typeof _set !== 'object')  ||
         (_djin === null)            ||
         (typeof _djin !== 'object') )
    {
        return STATUS.INVALID;
    }

    const djin = normal(_djin);

    if (!record_valid(djin))
    {
        return STATUS.INVALID;
    }

    if (_set.reserved.includes(djin.name))
    {
        return STATUS.RESERVED;
    }

    if (find_normal(_set, djin.name) !== null)
    {
        return STATUS.DUPLICATE;
    }

    if (_set.items.length >= _set.capacity)
    {
        return STATUS.FULL;
    }

    const status = register_settings(_set, djin);

    if (status !== STATUS.OK)
    {
        return status;
    }

    _set.items.push(djin);

    return STATUS.OK;
}

// 2.3
/**
 * How many records a set has.
 *
 * @param {?djin_set} _set  the set.
 * @returns {number}
 */
export function set_count(
    _set
)
{
    return (_set) ? _set.items.length : 0;
}

/**
 * The record at a place, in the order they were taken.
 *
 * @param {?djin_set} _set    the set.
 * @param {number}    _index  the place, from 0.
 * @returns {?djin_record} the record; null past the last.
 */
export function set_at(
    _set,
    _index
)
{
    return ( (_set)        &&
             (_index >= 0) &&
             (_index < _set.items.length) ) ? _set.items[_index].record
                                            : null;
}

/**
 * The record of a name.
 *
 * @param {?djin_set} _set   the set.
 * @param {string}    _name  the name.
 * @returns {?djin_record} the record; null for no such djin.
 */
export function set_find(
    _set,
    _name
)
{
    if ( (!_set) ||
         (typeof _name !== 'string') )
    {
        return null;
    }

    const found = find_normal(_set, encode(_name));

    return (found !== null) ? found.record : null;
}

// 2.4
/**
 * A djin's command of a name.
 *
 * @param {?djin_record} _djin  the record.
 * @param {string}       _name  the command's name.
 * @returns {?djin_command} the command; null for no such command.
 */
export function command_find(
    _djin,
    _name
)
{
    if ( (!_djin) ||
         (typeof _name !== 'string') )
    {
        return null;
    }

    for (const command of (_djin.commands ?? []))
    {
        if (command.name === _name)
        {
            return command;
        }
    }

    return null;
}


//==============================================================================
// 3.  AS TEXT
//==============================================================================

/*
cell
  One cell of a row: its text, then a line break where it is the row's
last, else spaces to its column's width and two more.
*/
function cell(
    _text,
    _width,
    _is_last
)
{
    return _is_last ? (_text + '\n')
                    : (_text +
                       ' '.repeat(Math.max(_width - _text.length, 0) + 2));
}

/*
cut
  A text as snprintf leaves one in a buffer of a capacity, with "..." for
its last three bytes where it did not fit.
*/
function cut(
    _text,
    _capacity
)
{
    return (_text.length >= _capacity)
               ? (_text.slice(0, _capacity - 4) + '...')
               : _text;
}

/*
default_text
  A row's default as a description shows it.
*/
function default_text(
    _decl
)
{
    let named = null;

    for (let i = 0; (_decl.names !== null) && (i < _decl.name_count); ++i)
    {
        if (_decl.names[i].value === _decl.integer)
        {
            named = _decl.names[i].name;

            break;
        }
    }

    switch (_decl.kind)
    {
        case KIND.BOOL:
            return cut((_decl.integer !== 0n) ? 'true' : 'false',
                       DEFAULT_ROOM);

        case KIND.REAL:
            return cut(format_real(_decl.real, _decl.negative_nan),
                       DEFAULT_ROOM);

        case KIND.TEXT:
            return cut((_decl.text !== null) ? ('"' + _decl.text + '"')
                                             : 'unset',
                       DEFAULT_ROOM);

        default:
            return cut((named !== null) ? named : _decl.integer.toString(),
                       DEFAULT_ROOM);
    }
}

/*
write_settings
  A frame's own settings, a row each: full name, kind, default, knob and
help, in columns. Nothing for a frame that declares none.
*/
function write_settings(
    _frame
)
{
    const rows  = [];
    const width = [0, 0, 0, 0, 0];
    let   out   = '';

    if (_frame.vars.length === 0)
    {
        return '';
    }

    for (const decl of _frame.vars)
    {
        const cells = [
            cut(_frame.name + '.' + decl.name, NAME_ROOM),
            encode(option_env.kind_name(decl.kind)),
            default_text(decl),
            (decl.knob !== null) ? decl.knob : '-',
            (decl.help !== null) ? decl.help : ''
        ];

        // a setting with no help ends at its knob, with no padding
        const last = (cells[4].length !== 0) ? 4 : 3;

        for (let c = 0; c <= last; ++c)
        {
            width[c] = Math.max(width[c], cells[c].length);
        }

        rows.push({ cells: cells, last: last });
    }

    for (const row of rows)
    {
        out += '  ';

        for (let c = 0; c <= row.last; ++c)
        {
            out += cell(row.cells[c], width[c], (c === row.last));
        }
    }

    return '\nsettings\n' + out;
}

function list_bytes(
    _set
)
{
    const frames = (_set.registry !== null)
                       ? option_env_registry.count(_set.registry)
                       : 0;
    let   name_width    = 0;
    let   version_width = 1;
    let   out           = '';

    for (const item of _set.items)
    {
        name_width    = Math.max(name_width, item.name.length);
        version_width = Math.max(version_width, item.version.length);
    }

    for (let i = 0; i < frames; ++i)
    {
        const frame = option_env_registry.at(_set.registry, i);

        name_width = Math.max(name_width,
                              (frame.name !== null) ? frame.name.length : 0);
    }

    for (const item of _set.items)
    {
        out += cell(item.name, name_width, false) +
               cell(item.version, version_width, false) +
               cell(item.summary, 0, true);
    }

    // a frame of settings with no record is listed after them
    for (let i = 0; i < frames; ++i)
    {
        const frame = option_env_registry.at(_set.registry, i);

        if ( (frame.name === null) ||
             (find_normal(_set, frame.name) !== null) )
        {
            continue;
        }

        out += cell(frame.name, name_width, false) +
               cell('-', version_width, false) +
               cell('settings only', 0, true);
    }

    return out;
}

// 3.1
/**
 * The list of a set's djins, a line each: name, version and summary in
 * columns; then each frame of the registry that has settings and no
 * record, as "settings only".
 *
 * The reference writes to a sink and returns 0; this returns the text.
 *
 * @param {?djin_set} _set  the set.
 * @returns {?string} the text; null for no set.
 */
export function write_list(
    _set
)
{
    return (_set) ? decode(list_bytes(_set)) : null;
}

function description_bytes(
    _djin
)
{
    let out   = cell(_djin.name, 0, false) + cell(_djin.version, 0, true) +
                '  ' + cell(_djin.summary, 0, true);
    let width = 0;

    for (const command of _djin.commands)
    {
        width = Math.max(width, command.name.length);
    }

    if (_djin.commands.length !== 0)
    {
        out += '\ncommands\n';

        for (const command of _djin.commands)
        {
            out += '  ' + cell(command.name, width, false) +
                   cell(command.summary, 0, true);
        }
    }

    if (_djin.settings !== null)
    {
        out += write_settings(_djin.settings);
    }

    return out;
}

// 3.2
/**
 * A djin's description: its name and version, its summary, its commands,
 * and its settings with their kinds, defaults, knobs and help.
 *
 * @param {?djin_record} _djin  the record.
 * @returns {?string} the text; null for no record.
 */
export function write_description(
    _djin
)
{
    return (_djin) ? decode(description_bytes(normal(_djin))) : null;
}

function frame_bytes(
    _frame
)
{
    return cell(_frame.name, 0, true) + '  settings only\n' +
           write_settings(_frame);
}

// 3.3
/**
 * The description of a frame of settings that has no record.
 *
 * @param {?option_env} _frame  the frame; one with a name.
 * @returns {?string} the text; null for no frame, or one with no name.
 */
export function write_frame(
    _frame
)
{
    return ( (_frame) &&
             (_frame.name !== null) &&
             (_frame.name !== undefined) ) ? decode(frame_bytes(_frame))
                                           : null;
}

/**
 * The writers on byte strings, and a record as they hold one, for the
 * program's commands, which count bytes themselves.
 */
export const bytes = Object.freeze({
    normal:      normal,
    find:        find_normal,
    list:        list_bytes,
    description: description_bytes,
    frame:       frame_bytes
});
