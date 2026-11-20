/*******************************************************************************
* djinterp.js [tests]                                          prototype.test.js
*
*   The four runs this port was handed to begin with: the starting
* package's driver (tools/option_driver.c, kept as it came) declares two
* rows, loads the script it is given, and prints each status and each
* value with its source. `tests/transcripts/prototype/` holds the script
* and the driver's output for each run, recorded against djinterp at
* 2bb6b246 before a line of the port was written; the driver built against
* d20c0b23 prints the same bytes.
*   The driver is small enough to be written out again here, statement for
* statement, over the port.
*
*
* path:      /tests/option/prototype.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { result_status, status_message }
    from '../../src/option/option_common.js';
import * as option_env from '../../src/option/option_env.js';

const ROWS = [
    option_env.row_real('ratio', 0.5, 'a real'),
    option_env.row_int_range('width', 240, 100, 600, 'an int in range')
];

/*
option_driver
  tools/option_driver.c's main, over the port: what it prints for a script.
*/
function option_driver(
    _script
)
{
    const env = option_env.init({ bindings: 16, vars: 8, text: 1024 });
    let   out = 'init 0\n';

    for (const row of ROWS)
    {
        out += 'declare ' + row.name + ' ' +
               result_status(option_env.declare(env, row)) + '\n';
    }

    const loaded = option_env.load(env, _script);
    const status = result_status(loaded);

    out += 'load ' + status + ' (' + status_message(status) + ') at ' +
           (loaded.error_offset ?? 0) + '\n';

    for (let i = 0; i < 2; ++i)
    {
        out += ROWS[i].name + '=' + option_env.format(env, 0, i) + '  [' +
               option_env.source_name(option_env.source(env, 0, i)) + ']\n';
    }

    return out;
}

for (const name of ['bind', 'refuse', 'stops', 'exponent'])
{
    test('the starting package\'s run "' + name + '"', () =>
    {
        const read = (_suffix) => readFileSync(
            new URL('../transcripts/prototype/' + name + _suffix,
                    import.meta.url), 'utf8');

        assert.equal(option_driver(read('.in')), read('.out'));
    });
}
