/*******************************************************************************
* djinterp.js [tools]                                              fuzz_check.js
*
*   Sets the port against the reference on sessions nobody typed:
*     node tools/fuzz_check.js BUILD KIND FIRST LAST COUNT
*   KIND is `session` or `program`. For each seed from FIRST to LAST it
* makes an input of COUNT lines (tools/fuzz_session.js or
* tools/fuzz_program.js), gives it to the reference as tools/record.js
* does and to the port as the tests do, and compares their bytes. It
* stops at the first seed that differs, having said the line, and exits
* 1; nothing is written into the repository.
*   A seed that differs is a transcript worth keeping: make its input
* again with the fuzzer, put it under tests/transcripts, and record it.
*
*
* path:      /tools/fuzz_check.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runProgram } from '../tests/support/program.js';
import { runSession } from '../tests/support/session.js';
import { programBytes, programHome, sessionBytes } from './record.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = 'fuzz_check';

const [build, kind, first, last, count] = process.argv.slice(2);

if ( (count === undefined)       ||
     ( (kind !== 'session') &&
       (kind !== 'program') ) )
{
    console.error('usage: node tools/fuzz_check.js BUILD session|program ' +
                  'FIRST LAST COUNT');
    process.exit(2);
}

for (let seed = Number(first); seed <= Number(last); ++seed)
{
    const made = spawnSync(process.execPath,
                           [join(HERE, 'fuzz_' + kind + '.js'), String(seed),
                            count],
                           { maxBuffer: 1 << 28 });

    if (made.status !== 0)
    {
        throw new Error('the fuzzer exited ' + made.status);
    }

    const input = made.stdout.toString('latin1');
    const want  = ((kind === 'session')
                       ? sessionBytes(build, made.stdout)
                       : programBytes(build, NAME, input))
                      .toString('latin1');
    const got   = (kind === 'session')
                      ? runSession(input)
                      : runProgram(input, programHome(NAME).settings);

    if (got !== want)
    {
        const gotLines  = got.split('\n');
        const wantLines = want.split('\n');
        const at        = wantLines.findIndex((_line, _i) =>
                                               (_line !== gotLines[_i]));
        const asked      = wantLines.slice(0, at + 1).reverse()
                               .find((_line) => _line.startsWith('> '));

        console.log('seed ' + seed + ' differs at line ' + (at + 1) +
                    ', answering ' + JSON.stringify(asked) +
                    '\n  reference: ' + JSON.stringify(wantLines[at]) +
                    '\n  port:      ' + JSON.stringify(gotLines[at]));
        process.exit(1);
    }
}

console.log(kind + ' seeds ' + first + '..' + last + ' x ' + count +
            ' lines: the port and the reference agree');
