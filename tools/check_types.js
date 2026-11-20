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
* as they are written (docs/style_guidelines_js.html, section 7).
*   Everywhere, what is checked is what the comments claim: a function
* with a JSDoc comment is held to its parameters and what it returns, and
* every type a comment names must be one that exists.
*   Every module is held to the checker's strict mode: a type on every
* parameter, and null and undefined told apart from values. It was
* brought in a module at a time (the owner's ruling D24, 2026-11-16), and
* has held all of them since 2026-11-18. The declarations are written by
* the same pass, so they say where a value may be null.
*   Exits 1, having shown them, where the checker finds anything it holds
* a module to; types/ is then left as it was.
*
*
* path:      /tools/check_types.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.18
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT  = join(dirname(fileURLToPath(import.meta.url)), '..');
const [tsc] = process.argv.slice(2);

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
const said     = check(['--strict', '--declaration', '--emitDeclarationOnly',
                        '--outDir', made]);
const findings = said.split('\n').filter((_line) =>
                                             _line.includes('error TS'));

if (findings.length !== 0)
{
    console.log(said.trimEnd());
    console.log(findings.length + ' to put right');
    rmSync(made, { recursive: true, force: true });
    process.exit(1);
}

rmSync(join(ROOT, 'types'), { recursive: true, force: true });
cpSync(made, join(ROOT, 'types'), { recursive: true });
rmSync(made, { recursive: true, force: true });
console.log('the code is as its comments say, in the strict mode; ' +
            'declarations in types/');
