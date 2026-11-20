/*******************************************************************************
* djinterp.js [tools]                                             check_style.js
*
*   Checks what of docs/JS_STYLE.md a program can check, in every file this
* repository's people write:
*     node tools/check_style.js
*   No line past 80 columns; no tab; no space at a line's end; no carriage
* return; one line break at the file's end; and, in a file under src/,
* tests/ or tools/, the banner's path is the file's own. A row of a table
* in a `.md` file may pass 80 columns, since it cannot be broken.
*   Generated files and recorded transcripts are not people's, and are not
* checked. Exits 1 where anything is found, having said where.
*
*
* path:      /tools/check_style.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKED = /\.(js|c|h|sh|md|json|html)$/;
const SKIPPED = new Set(['.git', 'node_modules', 'generated', 'transcripts']);

// not held to the columns: the style's own text and the starting package's
// driver, kept as they came; and the page of decisions, which is in the
// form of the owner's own such pages
const AS_CAME = new Set(['docs/JS_STYLE.md', 'tools/option_driver.c',
                         'decisions.html']);

/*
files_under
  Every checked file under a directory.
*/
function files_under(
    _directory
)
{
    const found = [];

    for (const name of readdirSync(_directory).sort())
    {
        const path = join(_directory, name);

        if (SKIPPED.has(name))
        {
            continue;
        }

        if (statSync(path).isDirectory())
        {
            found.push(...files_under(path));
        }
        else if (CHECKED.test(name))
        {
            found.push(path);
        }
    }

    return found;
}

let problems = 0;

/*
say
  One finding.
*/
function say(
    _file,
    _line,
    _what
)
{
    console.log(_file + ((_line !== 0) ? (':' + _line) : '') + ': ' + _what);
    ++problems;

    return;
}

for (const path of files_under(ROOT))
{
    const file = relative(ROOT, path).split('\\').join('/');
    const text = readFileSync(path, 'utf8');

    if (AS_CAME.has(file))
    {
        continue;
    }

    if ( !text.endsWith('\n') ||
         text.endsWith('\n\n') )
    {
        say(file, 0, 'does not end with one line break');
    }

    for (const [index, line] of text.split('\n').entries())
    {
        if ( ([...line].length > 80) &&
             !( file.endsWith('.md') &&
                line.startsWith('|') ) )
        {
            say(file, index + 1, 'is past 80 columns');
        }

        if (line.includes('\t'))
        {
            say(file, index + 1, 'has a tab');
        }

        if (line.includes('\r'))
        {
            say(file, index + 1, 'has a carriage return');
        }

        if (/[ ]$/.test(line))
        {
            say(file, index + 1, 'ends with a space');
        }
    }

    // a banner names the file it is in
    if ( /^(src|tests|tools)\/.*\.(js|c|h|sh)$/.test(file) &&
         !text.includes('path:      /' + file + '\n') )
    {
        say(file, 0, 'has no banner naming /' + file);
    }
}

if (problems !== 0)
{
    console.log(problems + ' to put right');
    process.exit(1);
}

console.log('nothing to put right');
