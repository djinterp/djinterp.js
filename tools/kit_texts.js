/*******************************************************************************
* djinterp.js [tools]                                               kit_texts.js
*
*   Writes generated/kit.json: what the reference's program writes that is
* text of its own and no work of a command's -- its version, its help and
* each command's, and each shell's completion script:
*     node tools/kit_texts.js BUILD COMMIT
*   BUILD is where tools/build.sh built BUILD/djinterp_fixture. Each text
* is the program's own, written by it with its output not a terminal and
* in an empty environment, and is copied here byte for byte; the port
* writes them back as they are (the owner's rulings of 2026-11-16 on
* help's text and on `completion`).
*
*
* path:      /tools/kit_texts.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.16
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = ['list', 'describe', 'get', 'set', 'help', 'completion'];
const SHELLS   = ['bash', 'zsh', 'fish', 'powershell'];

const [build, commit] = process.argv.slice(2);

if (commit === undefined)
{
    console.error('usage: node tools/kit_texts.js BUILD COMMIT');
    process.exit(2);
}

/*
written
  What the program writes for a command line that asks for a text: its
standard output, the run having gone well and said nothing.
*/
function written(
    _arguments
)
{
    const run = spawnSync(join(build, 'djinterp_fixture'), _arguments, {
        env:       { HOME: '/nonexistent', XDG_CONFIG_HOME: '/nonexistent' },
        maxBuffer: 1 << 26
    });

    if ( (run.status !== 0) ||
         (run.stderr.length !== 0) )
    {
        throw new Error(_arguments.join(' ') + ': exited ' + run.status +
                        ', saying ' + JSON.stringify(String(run.stderr)));
    }

    return run.stdout.toString('latin1');
}

const kit = {
    reference:    commit,
    generated_by: 'tools/kit_texts.js, from tools/djinterp_fixture_main.c',
    version:      written(['--version']),
    help:         { '': written(['--help']) },
    completion:   {}
};

for (const command of COMMANDS)
{
    kit.help[command] = written([command, '--help']);
}

for (const shell of SHELLS)
{
    kit.completion[shell] = written(['completion', shell]);
}

writeFileSync(join(ROOT, 'generated', 'kit.json'),
              JSON.stringify(kit, null, 1) + '\n');
console.log('generated/kit.json: a version, ' +
            Object.keys(kit.help).length + ' helps, ' +
            Object.keys(kit.completion).length + ' scripts');
