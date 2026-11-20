/*******************************************************************************
* djinterp.js [tests]                                                 program.js
*
*   The reference's djinterp program over the fixture, replayed through the
* port: what tools/record.js records of tools/djinterp_fixture_main.c, a
* line at a time. Each command line is a new program -- a registry made
* from generated/program.json, which is the reference's own registry
* written out, the kit's rows among them -- started over the settings file
* and the environment the lines before it left, as each of the reference's
* runs is a new process.
*   The lines and what is written for each are set out in tools/record.js.
* A terminal transcript is replayed through a program whose console draws
* colour (the owner's ruling D27), with what it writes left out, as the
* reference's was recorded with its output dropped.
*
*
* path:      /tests/support/program.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.20
*******************************************************************************/

import * as optionEnv from '../../src/option/option_env.js';
import * as optionEnvRegistry from '../../src/option/option_env_registry.js';
import * as djinterpCommands
    from '../../src/tools/djinterp/djinterp_commands.js';
import { openProgram } from '../../src/djinterp.js';
import { generated } from './fixture.js';

/*
must
  A step of making the fixture that the reference's own making passed.
*/
function must(
    _result
)
{
    if (!_result.isOk)
    {
        throw new Error('the program\'s registry could not be made');
    }

    return _result;
}

/**
 * The reference's program, made over the port: its registry from
 * generated/program.json, its settings not yet started.
 *
 * @param {object} _file         the settings file.
 * @param {Map<string, string>} _environment  the environment.
 * @param {boolean} [_colour=false]  whether its console draws colour.
 * @returns {object} the program.
 */
export function makeProgram(
    _file,
    _environment,
    _colour = false
)
{
    const data     = generated('program.json');
    const first    = data.frames[0];
    const registry = must(optionEnvRegistry.init(first.name, {
        bindings: first.bindings, vars: first.vars, text: first.text
    })).registry;

    for (const fx of data.frames)
    {
        // a frame from its record has the reference's room for it
        if (!fx.is_root)
        {
            must(optionEnvRegistry.add(registry,
                                       must(optionEnv.fromRecord(fx)).env));

            continue;
        }

        const frame = optionEnvRegistry.frame(registry);

        must(optionEnv.declareAll(frame, fx.rows));

        if (fx.scopes.length !== 0)
        {
            must(optionEnv.setScopes(frame, fx.scopes));
        }
    }

    const program = djinterpCommands.programMake({
        registry: registry, file: _file, environment: _environment,
        colour: _colour
    });

    return program;
}

/*
streamLines
  A stream's text as lines after a prefix; a last line with no line break
after the prefix with a backslash.
*/
function streamLines(
    _prefix,
    _text
)
{
    let out   = '';
    let start = 0;

    while (start < _text.length)
    {
        const end  = _text.indexOf('\n', start);
        const last = (end < 0);

        out  += _prefix + (last ? '\\ ' : ': ') +
                _text.slice(start, last ? _text.length : end) + '\n';
        start = last ? _text.length : (end + 1);
    }

    return out;
}

/**
 * A whole program transcript's input, replayed.
 *
 * @param {string} _input     the `.in` file's bytes, as a byte string.
 * @param {string} _settings  what the settings file is called: the path
 *        the transcript's `.meta` names.
 * @param {boolean} [_terminal=false]  whether it is a terminal
 *        transcript: colour drawn, and what is written left out.
 * @returns {string} the `.out` file's bytes, as a byte string.
 */
export function runProgram(
    _input,
    _settings,
    _terminal = false
)
{
    const environment = new Map();
    const unescape    = (_text) => _text.replace(/\\([nt\\])/g, (_m, _c) =>
                            ((_c === 'n') ? '\n' : (_c === 't') ? '\t'
                                                                : '\\'));
    let   text        = null;
    let   out         = '';
    const file        = {
        name:  _settings,
        read:  () => text,
        write: (_new) =>
        {
            text = _new;
        }
    };
    const lines       = _input.split('\n');

    // one program for the whole transcript, as a page has one: `run` is
    // what makes each line a process of the reference's
    const dj          = openProgram(makeProgram(file, environment,
                                                    _terminal));

    if (lines[lines.length - 1] === '')
    {
        lines.pop();
    }

    for (const line of lines)
    {
        out += '> ' + line + '\n';

        if ( (line.length === 0) ||
             line.startsWith('#') )
        {
            continue;
        }

        if (line.startsWith('env '))
        {
            const equals = line.indexOf('=');

            environment.set(line.slice(4, equals),
                            line.slice(equals + 1));
        }
        else if (line.startsWith('unenv '))
        {
            environment.delete(line.slice(6));
        }
        else if (line.startsWith('file '))
        {
            text = unescape(line.slice(5));
        }
        else if (line === 'nofile')
        {
            text = null;
        }
        else
        {
            const ran = dj.runNow(line);

            out += 'exit ' + ran.status + '\n' +
                   (_terminal ? '' : streamLines('out', ran.out)) +
                   streamLines('err', ran.err);
        }
    }

    return out;
}
