/*******************************************************************************
* djinterp.js [tests]                                            session.test.js
*
*   The session transcripts, replayed: each `tests/transcripts/session_*.in`
* through the port (tests/support/session.js), compared with the bytes
* tools/session.c wrote for it from the reference. They cover the option
* machine, the registry and the djin records together, as one session uses
* them.
*   A transcript whose `.meta` names another commit than the generated data
* fails: the two are recorded together or not at all.
*
*
* path:      /tests/session.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { generated } from './support/fixture.js';
import { runSession } from './support/session.js';

const DIRECTORY = new URL('./transcripts/', import.meta.url);
const NAMES     = readdirSync(DIRECTORY)
                      .filter((_file) => ( _file.startsWith('session_') &&
                                           _file.endsWith('.in') ))
                      .map((_file) => _file.slice(0, -3))
                      .sort();

/*
firstDifference
  Where two texts first differ, with the input line being answered: what a
failure says, in place of two whole transcripts.
*/
function firstDifference(
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
    assert.ok(NAMES.length >= 9);
});

for (const name of NAMES)
{
    test('transcript ' + name, () =>
    {
        const read = (_suffix) => readFileSync(new URL(name + _suffix,
                                                       DIRECTORY), 'latin1');
        const meta = read('.meta');

        assert.ok(meta.includes('commit: ' +
                                generated('option.json').reference + '\n'),
                  'recorded at the generated data\'s commit');

        const got = runSession(read('.in'));

        assert.equal(firstDifference(got, read('.out')), null);
        assert.equal(got.length, read('.out').length);
    });
}
