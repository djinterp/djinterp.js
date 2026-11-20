/*******************************************************************************
* djinterp.js [tools]                                             check_types.js
*
*   Reads the JSDoc under src/ as types, checks the code against it, and
* writes the declarations it makes into types/ (types/src for src/, and
* types/generated for the generated modules src/ imports):
*     node tools/check_types.js TSC
*   TSC is the path of a TypeScript compiler's `tsc`, 5.5 or later. The
* repository does not depend on one, no page needs one, and
* `node --test` does not run this: the sources are what a page imports,
* as they are written (docs/JS_STYLE.md, JS2).
*   Everywhere, what is checked is what the comments claim: a function
* with a JSDoc comment is held to its parameters and what it returns, and
* every type a comment names must be one that exists.
*   The modules in STRICT are also held to the checker's strict mode: a
* type on every parameter, and null and undefined told apart from values.
* The strict mode is brought in a module at a time (the owner's ruling of
* 2026-11-16); a module joins STRICT when it has no finding there, and
* the tool says how many findings the others still have.
*   Exits 1, having shown them, where the checker finds anything it holds
* a module to; types/ is then left as it was.
*
*
* path:      /tools/check_types.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.16
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..');
const [tsc] = process.argv.slice(2);

// the modules held to the strict mode, by their paths under src/
const STRICT = ['event/event_common.js', 'event/event_handler_common.js',
                'option/option_common.js', 'text/cut.js',
                'text/real_format.js', 'text/real_read.js'];

if (tsc === undefined)
{
    console.error('usage: node tools/check_types.js TSC');
    process.exit(2);
}

/*
sourcesUnder
  Every `.js` file under a directory.
*/
function sourcesUnder(
    _directory
)
{
    const found = [];

    for (const name of readdirSync(_directory).sort())
    {
        const path = join(_directory, name);

        if (statSync(path).isDirectory())
        {
            found.push(...sourcesUnder(path));
        }
        else if (name.endsWith('.js'))
        {
            found.push(path);
        }
    }

    return found;
}

/*
check
  Runs the checker over src/ and the generated modules, with more
arguments; what it said, a finding a line or more.
*/
function check(
    _more
)
{
    const ran = spawnSync(process.execPath, [
        tsc, '--allowJs', '--checkJs', '--target', 'es2022',
        '--module', 'nodenext', '--moduleResolution', 'nodenext',
        '--skipLibCheck', '--rootDir', ROOT, ..._more,
        ...sourcesUnder(join(ROOT, 'src')),
        ...sourcesUnder(join(ROOT, 'generated'))
    ], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26 });

    return (ran.stdout ?? '') + (ran.stderr ?? '');
}

const made     = mkdtempSync(join(tmpdir(), 'djinterp.js-types-'));
const said     = check(['--declaration', '--emitDeclarationOnly',
                        '--outDir', made]);
const findings = said.split('\n').filter((_line) =>
                                             _line.includes('error TS'));

// the strict mode's findings, by the module each is in
const strict   = check(['--noEmit', '--strict']).split('\n')
                     .filter((_line) => _line.includes('error TS'));
const held     = strict.filter((_line) =>
                     STRICT.some((_module) =>
                                     _line.startsWith('src/' + _module + '(')));

if ( (findings.length !== 0) ||
     (held.length !== 0) )
{
    console.log([...((findings.length !== 0) ? [said.trimEnd()] : []),
                 ...held].join('\n'));
    console.log((findings.length + held.length) + ' to put right');
    rmSync(made, { recursive: true, force: true });
    process.exit(1);
}

rmSync(join(ROOT, 'types'), { recursive: true, force: true });
cpSync(made, join(ROOT, 'types'), { recursive: true });
rmSync(made, { recursive: true, force: true });
console.log('the code is as its comments say; declarations in types/');
console.log(STRICT.length + ' modules are held to the strict mode; the ' +
            'others have ' + (strict.length - held.length) +
            ' findings there');
