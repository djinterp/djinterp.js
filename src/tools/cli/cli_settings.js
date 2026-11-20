/*******************************************************************************
* djinterp.js [cli]                                              cli_settings.js
*
*   A run's settings, as the reference's command-line kit readies them: the
* environment's, the user's settings file's, and the command line's, each
* bound in the program's registry as the source it is; and what the kit
* says when one of them is refused.
*   Only what a page's console needs of the kit is here. The kit's own djin
* `cli` and the root's `plugin_path`, which say where native plugins are
* found, are not: a page loads no native plugin. Nor is the kit's walk past
* the values of its own options, none of which this port has
* (HANDOFF.md, "what is not ported").
*   The reference reads the process's environment and a file under the
* user's home. A page has neither, so both are given: an environment as
* `optionEnv.import` takes one, and a FILE, which is an object
*     { name: string, read(): ?string, write(text: string): void }
* `name` is what the file is called when the kit speaks of it; `read`
* gives its text, or null where there is none yet; `write` replaces it, and
* throws an Error whose message says why where it cannot.
*   What is said is the reference's, character for character.
*   reference: inc/djinterp/tools/cli/c/cli_settings.h and
*              src/djinterp/tools/cli/c/cli_settings.c, at dfc793c4
*
*
* path:      /src/tools/cli/cli_settings.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

/*
TABLE OF CONTENTS
=================
1.  What went wrong
    1.  why
2.  The user's file
    1.  load
3.  A run's settings
    1.  start
    2.  take
    3.  saidFor
*/

import { STATUS, resultStatus, statusName }
    from '../../option/option_common.js';
import * as optionEnv from '../../option/option_env.js';
import * as optionEnvRegistry from '../../option/option_env_registry.js';
import { cutAt } from '../../text/cut.js';

// the types of other modules that this one's comments name
/** @import { OptionEnvRegistry } from '../../option/option_env_registry.js' */
/** @import { OptionResult } from '../../option/option_common.js' */

const ROOM     = 256;
const envInner = optionEnv.inner;
const regInner = optionEnvRegistry.inner;


//==============================================================================
// 1.  WHAT WENT WRONG
//==============================================================================

// 1.1
/**
 * Why a setting was refused, in the kit's words: an unknown name, with the
 * name it was probably meant to be; a value that is not built; a value the
 * setting does not take; or the status's name.
 *
 * @param {OptionEnvRegistry} _registry  the registry the name was
 *        looked for in.
 * @param {number}  _status    the refusal's status.
 * @param {string}  _name      the setting's name as written.
 * @param {?string} _value     the value as written, or null for
 *        none.
 * @param {number}  [_capacity=256]  the room the reference's caller gives
 *        the message, with its terminator; a longer one is cut short.
 * @returns {string} the message.
 */
export function why(
    _registry,
    _status,
    _name,
    _value,
    _capacity = ROOM
)
{
    const shown = cutAt(_name, ROOM);
    let   out;

    if (_status === STATUS.KEY_ABSENT)
    {
        const near = regInner.suggest(_registry, _name);

        out = ( (near.length > 0) &&
                (near.length < ROOM) )
                  ? ('no setting is named \'' + shown +
                     '\'; did you mean \'' + near + '\'?')
                  : ('no setting is named \'' + shown + '\'');
    }
    else if (_status === STATUS.POLICY_REJECTED)
    {
        out = '\'' + shown + '\' cannot be \'' + (_value ?? '') +
              '\' in this build';
    }
    else if (_value !== null)
    {
        out = '\'' + _value + '\' is not a value \'' + shown + '\' takes';
    }
    else
    {
        out = '\'' + shown + '\' cannot be set so (' +
              statusName(_status) + ')';
    }

    return cutAt(out, _capacity - 1);
}


//==============================================================================
// 2.  THE USER'S FILE
//==============================================================================

/*
nameAt
  The name of the statement between two offsets of a script: what stands
before its '=', less the space around it.
*/
function nameAt(
    _script,
    _at,
    _end
)
{
    let from = _at;

    while ( (from < _end) &&
            ( (_script[from] === ' ') ||
              (_script[from] === '\t') ) )
    {
        ++from;
    }

    let to = from;

    while ( (to < _end) &&
            (_script[to] !== '=') )
    {
        ++to;
    }

    while ( (to > from) &&
            ( (_script[to - 1] === ' ') ||
              (_script[to - 1] === '\t') ) )
    {
        --to;
    }

    return _script.slice(from, to);
}

/*
valueAt
  The value of the statement between two offsets of a script: what follows
its '=', less the space around it, cut to the kit's room; null for a
statement with no '='.
*/
function valueAt(
    _script,
    _at,
    _end
)
{
    const equals = _script.slice(_at, _end).indexOf('=');

    if (equals < 0)
    {
        return null;
    }

    let from = _at + equals + 1;
    let to   = _end;

    while ( (from < to) &&
            ( (_script[from] === ' ') ||
              (_script[from] === '\t') ) )
    {
        ++from;
    }

    while ( (to > from) &&
            ( (_script[to - 1] === ' ')  ||
              (_script[to - 1] === '\t') ||
              (_script[to - 1] === '\r') ) )
    {
        --to;
    }

    return _script.slice(from, Math.min(to, from + ROOM - 1));
}

// 2.1
/**
 * Binds a settings file's statements, as the file. A statement refused
 * does not stop the rest: it is reported, with its line, and the load
 * goes on after it.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {string} _script  the file's text.
 * @param {function(number, string): void} _report  told each refusal: the
 *        statement's line, from 1, and why.
 */
export function load(
    _registry,
    _script,
    _report
)
{
    const script  = envInner.cstr(_script);
    let   offset  = 0;
    let   line    = 1;
    let   counted = 0;

    while (offset < script.length)
    {
        /** @type {OptionResult & {errorOffset?: number}} */
        const done = regInner.load(_registry, script.slice(offset),
                                   optionEnv.SOURCE.FILE);

        if (done.isOk)
        {
            break;
        }

        const at = offset + (done.errorOffset ?? 0);

        // the failing statement's line
        for (; counted < at; ++counted)
        {
            line += (script[counted] === '\n') ? 1 : 0;
        }

        const end = envInner.statementEnd(script, at);

        _report(line, why(_registry, resultStatus(done),
                          nameAt(script, at, end),
                          valueAt(script, at, end)));

        // on from the end of the one that failed, and never back
        offset = (end > at) ? end : (at + 1);
    }

    return;
}


//==============================================================================
// 3.  A RUN'S SETTINGS
//==============================================================================

/*
prefixOf
  A program's own environment prefix: its name in upper case, '-' as '_',
and a '_' after it; empty for no name.
*/
function prefixOf(
    _name
)
{
    let out = '';

    for (const c of (_name ?? ''))
    {
        out += ( (c >= 'a') && (c <= 'z') )
                   ? String.fromCharCode(c.charCodeAt(0) - 32)
                   : (c === '-') ? '_' : c;
    }

    return (out.length !== 0) ? (out + '_') : '';
}

// 3.1
/**
 * Readies a run's settings: the environment's, under `DJINTERP_` and then
 * the program's own prefix, whose binding wins; then the user's file's. A
 * value the environment gives that is refused is passed over in silence,
 * as the reference passes it; a statement of the file that is refused is
 * said as a warning, `FILE:LINE: warning: MESSAGE`.
 *
 * @param {object} _program  the program
 *        (src/tools/djinterp/djinterp_commands.js): its `registry`,
 *        `name`, `environment` and `file` are read.
 * @returns {string} the warnings, a line each.
 */
export function start(
    _program
)
{
    const lookup = envInner.lookupOf(_program.environment);
    const prefix = prefixOf(_program.name);
    let   said   = '';

    // the shared prefix, then the program's own, whose binding wins
    regInner.import(_program.registry, 'DJINTERP_', lookup);

    if ( (prefix.length !== 0) &&
         (prefix !== 'DJINTERP_') )
    {
        regInner.import(_program.registry, prefix, lookup);
    }

    if (_program.file === null)
    {
        return said;
    }

    let text = null;

    try
    {
        text = _program.file.read();
    }
    catch (error)
    {
        said += _program.name + ': warning: cannot read \'' +
                _program.file.name + '\': ' +
                String(error?.message ?? error) + '\n';
    }

    if (typeof text === 'string')
    {
        load(_program.registry, text, (_line, _why) =>
        {
            said += _program.file.name + ':' + _line +
                    ': warning: ' + _why + '\n';
        });
    }

    return said;
}

/*
shaped
  Whether an argument has a setting's shape: "--set", or "--" and a name
with a point in it.
*/
function shaped(
    _argument
)
{
    if ( !_argument.startsWith('--') ||
         (_argument.length === 2) )
    {
        return false;
    }

    if (_argument === '--set')
    {
        return true;
    }

    const equals = _argument.indexOf('=');

    return _argument.slice(2, (equals < 0) ? _argument.length : equals)
                    .includes('.');
}

// 3.3
/**
 * What the kit says of a setting the command line gave and the registry
 * refused: the message of a usage error.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {Array<string>} _argv    the command line.
 * @param {number}        _at      where the option stands on it.
 * @param {number}        _status  the refusal's status.
 * @returns {string} the message.
 */
export function saidFor(
    _registry,
    _argv,
    _at,
    _status
)
{
    const set  = (_argv[_at] === '--set');
    let   text = !set                      ? _argv[_at].slice(2)
               : (_at + 1 < _argv.length)  ? _argv[_at + 1]
               : null;

    // --set with no NAME=VALUE after it
    if ( (text === null) ||
         ( set &&
           !text.includes('=') ) )
    {
        return '--set: NAME=VALUE is required';
    }

    // a bool's --no-NAME names NAME
    if ( !set                   &&
         text.startsWith('no-') &&
         !text.includes('=') )
    {
        text = text.slice(3);
    }

    const equals = text.indexOf('=');
    const name   = (equals < 0) ? text : text.slice(0, equals);

    // --NAME or --no-NAME, which only a bool takes: the registry refuses
    // either, for a setting of another kind, as an argument it cannot take
    if ( !set           &&
         (equals < 0)   &&
         (_status === STATUS.INVALID_ARGUMENT) )
    {
        return _argv[_at] + ': \'' + text +
               '\' is not a bool: give it a value, as --' + text + '=VALUE';
    }

    const typed = _argv[_at].indexOf('=');

    return ((typed < 0) ? _argv[_at] : _argv[_at].slice(0, typed)) + ': ' +
           why(_registry, _status, name,
               (equals >= 0) ? text.slice(equals + 1) : null);
}

// 3.2
/**
 * Takes the settings a command line gives, wherever they stand on it --
 * "--set NAME=VALUE", "--DJIN.NAME=VALUE", "--DJIN.NAME" and
 * "--no-DJIN.NAME" -- and binds each as the command line; the arguments
 * left are the command's.
 *
 * @param {OptionEnvRegistry} _registry  the registry.
 * @param {Array<string>} _argv      the command line, the program's name
 *        first.
 * @param {ReadonlyArray<string>} _commands  the names of the program's
 *        commands: a refusal is said of the one the walk has reached.
 * @param {ReadonlyArray<string>} [_own=[]]  the long options that are the
 *        program's own, as typed without a value: none is taken for a
 *        setting's, whatever settings there are.
 * @returns {{kept: Array<string>, refused: ?{command: ?string,
 *            message: string}}} the arguments kept; and for a setting
 *          refused, which stops the walk, the command reached, or null
 *          for none, and the usage error's message.
 */
export function take(
    _registry,
    _argv,
    _commands,
    _own = []
)
{
    const kept    = [];
    let   command = null;
    let   ended   = false;

    for (let at = 0; at < _argv.length; ++at)
    {
        const argument = _argv[at];
        const first    = at;
        let   taken    = { took: 0, at: at, result: null };

        if ( (at > 0) &&
             !ended   &&
             shaped(argument) &&
             !_own.includes(argument.split('=')[0]) )
        {
            taken = regInner.takeOption(_registry, _argv, at);
            at    = taken.at;
        }

        if (taken.took < 0)
        {
            // said by the option as typed, wherever the walk stopped
            return {
                kept:    kept,
                refused: {
                    command: command,
                    message: saidFor(_registry, _argv, first,
                                     resultStatus(taken.result))
                }
            };
        }

        if (taken.took > 0)
        {
            continue;
        }

        kept.push(argument);
        ended = ( ended ||
                  (argument === '--') );

        // a word: a command's name takes the walk into it. The reference
        // looks only where an argument follows, since what it looks for
        // is an option whose value that argument would be
        if ( (at > 0)                  &&
             !ended                    &&
             (at + 1 < _argv.length)   &&
             (command === null)        &&
             !argument.startsWith('-') &&
             _commands.includes(argument) )
        {
            command = argument;
        }
    }

    return { kept: kept, refused: null };
}
