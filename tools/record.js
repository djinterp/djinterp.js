/*******************************************************************************
* djinterp.js [tools]                                                  record.js
*
*   Records transcripts from the reference (docs/JS_STYLE.md, section 6):
*     node tools/record.js BUILD COMMIT [NAME ...]
*   BUILD is where tools/build.sh built the tools; COMMIT is the
* reference's commit, written into each `.meta`. With no NAME, every
* `tests/transcripts/*.in` is recorded.
*   A transcript's name says which program it is given to:
*     session_NAME   BUILD/session, the whole `.in` as its input
*     program_NAME   BUILD/djinterp_fixture, once a line, as a new process
*                    each, as a shell would run the reference's program
*   For each it writes NAME.out, the program's bytes, and NAME.meta.
*
*   A PROGRAM TRANSCRIPT's `.in` holds command lines, and lines that set
* the scene for those after them:
*     env NAME=VALUE    a variable of the environment, for every later line
*     unenv NAME        takes one away
*     file TEXT         the user's settings file's text; \n \t \\ escape
*     nofile            no settings file
*     # ...             a comment
*   Each command line is given to the program as `--line LINE`, in a home
* of the transcript's own, named in its `.meta`, so that the file's path
* in what the program writes is the same on every recording. Its `.out`
* has, for each line: the line after "> "; for a command line, "exit N",
* then the program's output a line each after "out: ", then its errors
* after "err: ". A last line with no line break is written after "out\ "
* or "err\ ".
*
*
* path:      /tools/record.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync }
    from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE        = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTS = join(HERE, '..', 'tests', 'transcripts');
const HOME_ROOT   = '/tmp/djinterp.js/home';
const REPOSITORY  = 'djinterp';

/*
meta
  A transcript's `.meta`: what was run, on what, and when.
*/
function meta(
    _name,
    _program,
    _arguments,
    _commit,
    _more
)
{
    const lines = [
        'program: ' + _program,
        'arguments: ' + _arguments,
        'reference: ' + REPOSITORY,
        'commit: ' + _commit,
        'recorded: ' + new Date().toISOString().slice(0, 10),
        ..._more
    ];

    writeFileSync(join(TRANSCRIPTS, _name + '.meta'),
                  lines.join('\n') + '\n');

    return;
}

/*
record_session
  A session transcript: the whole input to BUILD/session.
*/
function record_session(
    _build,
    _commit,
    _name
)
{
    const run = spawnSync(join(_build, 'session'), [], {
        input: readFileSync(join(TRANSCRIPTS, _name + '.in')),
        env:   {}
    });

    if (run.status !== 0)
    {
        throw new Error(_name + ': tools/session exited ' + run.status);
    }

    writeFileSync(join(TRANSCRIPTS, _name + '.out'), run.stdout);
    meta(_name, 'tools/session.c', '(none; the input is its standard input)',
         _commit, ['environment: empty']);

    return;
}

/*
stream_lines
  A stream's bytes as lines after a prefix; a last line with no line break
after the prefix with a backslash.
*/
function stream_lines(
    _prefix,
    _bytes
)
{
    const out   = [];
    let   start = 0;

    while (start < _bytes.length)
    {
        const end  = _bytes.indexOf(0x0A, start);
        const last = (end < 0);

        out.push(Buffer.from(_prefix + (last ? '\\ ' : ': ')),
                 _bytes.subarray(start, last ? _bytes.length : end),
                 Buffer.from('\n'));
        start = last ? _bytes.length : (end + 1);
    }

    return out;
}

/*
record_program
  A program transcript: BUILD/djinterp_fixture, a process a command line.
*/
function record_program(
    _build,
    _commit,
    _name
)
{
    const home     = join(HOME_ROOT, _name);
    const settings = join(home, 'djinterp', 'settings');
    const env      = { HOME: home, XDG_CONFIG_HOME: home };
    const out      = [];
    const unescape = (_text) => _text.replace(/\\([nt\\])/g, (_m, _c) =>
                         ((_c === 'n') ? '\n' : (_c === 't') ? '\t' : '\\'));

    rmSync(home, { recursive: true, force: true });
    mkdirSync(home, { recursive: true });

    const lines = readFileSync(join(TRANSCRIPTS, _name + '.in'), 'latin1')
                      .split('\n');

    if (lines[lines.length - 1] === '')
    {
        lines.pop();
    }

    for (const line of lines)
    {
        out.push(Buffer.from('> ' + line + '\n', 'latin1'));

        if ( (line.length === 0) ||
             line.startsWith('#') )
        {
            continue;
        }

        if (line.startsWith('env '))
        {
            const equals = line.indexOf('=');

            env[line.slice(4, equals)] = line.slice(equals + 1);
        }
        else if (line.startsWith('unenv '))
        {
            delete env[line.slice(6)];
        }
        else if (line.startsWith('file '))
        {
            mkdirSync(dirname(settings), { recursive: true });
            writeFileSync(settings, unescape(line.slice(5)), 'latin1');
        }
        else if (line === 'nofile')
        {
            rmSync(settings, { force: true });
        }
        else
        {
            const run = spawnSync(join(_build, 'djinterp_fixture'),
                                  ['--line', Buffer.from(line, 'latin1')],
                                  { env: env });

            out.push(Buffer.from('exit ' + run.status + '\n'),
                     ...stream_lines('out', run.stdout),
                     ...stream_lines('err', run.stderr));
        }
    }

    writeFileSync(join(TRANSCRIPTS, _name + '.out'), Buffer.concat(out));
    meta(_name, 'tools/djinterp_fixture_main.c',
         '--line LINE, a process a command line', _commit,
         ['home: ' + home, 'settings: ' + settings,
          'environment: HOME and XDG_CONFIG_HOME are the home; then as ' +
          'the input\'s env lines set it']);

    return;
}

const [build, commit, ...names] = process.argv.slice(2);

if ( (build === undefined) ||
     (commit === undefined) )
{
    console.error('usage: node tools/record.js BUILD COMMIT [NAME ...]');
    process.exit(2);
}

const all = (names.length !== 0)
                ? names
                : readdirSync(TRANSCRIPTS)
                      .filter((_file) => _file.endsWith('.in'))
                      .map((_file) => _file.slice(0, -3))
                      .sort();

for (const name of all)
{
    if (name.startsWith('session_'))
    {
        record_session(build, commit, name);
    }
    else if (name.startsWith('program_'))
    {
        record_program(build, commit, name);
    }
    else
    {
        throw new Error(name + ': neither session_ nor program_');
    }

    console.log('recorded ' + name);
}
