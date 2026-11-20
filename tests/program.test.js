/*******************************************************************************
* djinterp.js [tests]                                            program.test.js
*
*   The program transcripts, replayed: each `tests/transcripts/program_*.in`
* through the port (tests/support/program.js), compared with the bytes
* tools/record.js wrote of the reference's own djinterp program for it --
* its output, its errors and its exit status, a process a line. They cover
* `list`, `describe`, `get` and `set`, and a run's settings from the
* environment, the user's file and the command line.
*
*
* path:      /tests/program.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { generated } from './support/fixture.js';
import { run_program } from './support/program.js';

const DIRECTORY = new URL('./transcripts/', import.meta.url);
const NAMES     = readdirSync(DIRECTORY)
                      .filter((_file) => ( _file.startsWith('program_') &&
                                           _file.endsWith('.in') ))
                      .map((_file) => _file.slice(0, -3))
                      .sort();

/*
first_difference
  Where two texts first differ, with the command line being answered.
*/
function first_difference(
    _got,
    _want
)
{
    const got  = _got.split('\n');
    const want = _want.split('\n');

    for (let i = 0; i < Math.max(got.length, want.length); ++i)
    {
        if (got[i] !== want[i])
        {
            const asked = want.slice(0, i + 1).reverse()
                              .find((_line) => _line.startsWith('> '));

            return 'line ' + (i + 1) + ', answering ' +
                   JSON.stringify(asked) + '\n  reference: ' +
                   JSON.stringify(want[i]) + '\n  port:      ' +
                   JSON.stringify(got[i]);
        }
    }

    return null;
}

test('there are transcripts to replay', () =>
{
    assert.ok(NAMES.length >= 4);
});

test('the registry replayed over is the reference\'s, at one commit', () =>
{
    assert.equal(generated('program.json').reference,
                 generated('option.json').reference);
});

for (const name of NAMES)
{
    test('transcript ' + name, () =>
    {
        const read     = (_suffix) => readFileSync(new URL(name + _suffix,
                                                           DIRECTORY),
                                                   'latin1');
        const meta     = read('.meta');
        const settings = /^settings: (.*)$/m.exec(meta);

        assert.ok(meta.includes('commit: ' +
                                generated('option.json').reference + '\n'),
                  'recorded at the generated data\'s commit');
        assert.notEqual(settings, null);

        const got = run_program(read('.in'), settings[1]);

        assert.equal(first_difference(got, read('.out')), null);
        assert.equal(got.length, read('.out').length);
    });
}
