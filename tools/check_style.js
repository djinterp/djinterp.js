/*******************************************************************************
* djinterp.js [tools]                                             check_style.js
*
*   Checks what of docs/style_guidelines_js.html a program can check, in
* every file this repository's people write:
*     node tools/check_style.js
*   No line past 80 columns; no tab; no space at a line's end; no carriage
* return; one line break at the file's end; and, in a file under src/,
* tests/ or tools/, the banner's path is the file's own. A banner's
* title, `created:` and `revised:` end on column 80, and it has all five
* of its fields, as the C guide's do.
*   Under src/, a comment names another module's type by an `@import`,
* never an inline `import(...)`.
*   In a module under src/, a function that is not exported has a JSDoc
* comment that names it on its first line, ` * name`, as the C guide's
* definitions are named (the owner's ruling D25, 2026-11-17).
*   A file's table of contents agrees with its body, as the C guide has
* it: each section's name in capitals with a line of hyphens beneath it,
* the name and number its divider has, and as many entries as the section
* has markers (`// 1.1`), each marker heading what its entry names
* first. Under src/, two empty lines come before each section's divider
* and nowhere else. A row of a table in a `.md` file may pass 80 columns,
* since it cannot be broken.
*   Generated files, recorded transcripts and the declarations in types/
* are not people's, and are not checked. Exits 1 where anything is found,
* having said where.
*
*
* path:      /tools/check_style.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.18
*******************************************************************************/

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKED = /\.(js|c|h|sh|md|json|html)$/;
const SKIPPED = new Set(['.git', 'node_modules', 'generated', 'transcripts',
                         'types']);

// not held to the columns: the starting package's driver, kept as it
// came; and the page of decisions, which is in the form of the owner's
// own such pages
const AS_CAME = new Set(['tools/option_driver.c', 'decisions.html']);

/*
filesUnder
  Every checked file under a directory.
*/
function filesUnder(
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
            found.push(...filesUnder(path));
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

for (const path of filesUnder(ROOT))
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

    // a function inside a module is named by its JSDoc comment
    if (/^src\/.*\.js$/.test(file))
    {
        const lines = text.split('\n');

        for (const [index, line] of lines.entries())
        {
            const found = /^function (\w+)\(/.exec(line);

            if (found === null)
            {
                continue;
            }

            // the comment's first line: after `/*`, or ` * ` after `/**`
            let start = index - 1;

            while ( (start >= 0) &&
                    !lines[start].startsWith('/*') )
            {
                --start;
            }

            const named = (start < 0) ? null
                        : lines[start + 1].replace(/^ \* /, '');

            if ( (start < 0)                  ||
                 (lines[start] !== '/**')      ||
                 (lines[index - 1] !== ' */') ||
                 (named !== found[1]) )
            {
                say(file, index + 1, 'function ' + found[1] + ' has no ' +
                    'comment that names it first');
            }
        }
    }

    // another module's type comes by @import
    if (/^src\/.*\.js$/.test(file))
    {
        for (const [index, line] of text.split('\n').entries())
        {
            if (/^\s*\*.*\bimport\(['"]/.test(line))
            {
                say(file, index + 1, 'a type named by import(...), and ' +
                    'not by an @import');
            }
        }
    }

    // two empty lines before a section's divider, and nowhere else
    if (/^src\/.*\.js$/.test(file))
    {
        const lines = text.split('\n');

        for (let index = 2; index < lines.length; ++index)
        {
            const named   = lines[index + 1] ?? '';
            const divider = /^\/\/=+$/.test(lines[index])           &&
                            /^\/\/ (\d+\.\s+)?[A-Z]/.test(named) &&
                            (lines[index - 1] !== '//' + '='.repeat(78));

            if ( divider &&
                 ( (lines[index - 1] !== '') ||
                   (lines[index - 2] !== '') ||
                   (lines[index - 3] === '') ) )
            {
                say(file, index + 1, 'a section\'s divider wants two ' +
                    'empty lines before it, and no more');
            }
            else if ( !divider              &&
                      (lines[index] !== '') &&
                      (lines[index - 1] === '') &&
                      (lines[index - 2] === '') )
            {
                say(file, index + 1, 'two empty lines come only before ' +
                    'a section\'s divider');
            }
        }
    }

    // a table of contents is its body's
    const toc = file.endsWith('.js')
                    ? /\/\*\nTABLE OF CONTENTS\n=+\n([\s\S]*?)\n\*\//.exec(text)
                    : null;

    if (toc !== null)
    {
        const body    = [...text.matchAll(
                            /^\/\/=+\n\/\/ (\d+)\.\s+(.*)\n\/\/=+$/mg)]
                            .map((_found) => _found[1] + '.  ' + _found[2]);
        const marks   = [...text.matchAll(/^\/\/ (\d+)\.\d+$/mg)]
                            .map((_found) => _found[1]);
        const listed  = [];
        const entries = [];
        const lines   = toc[1].split('\n');

        for (const [index, line] of lines.entries())
        {
            const section = /^(\d+)\.\s+(.*)$/.exec(line);

            if (section !== null)
            {
                const under = ' '.repeat(line.length - section[2].length) +
                              '-'.repeat(section[2].length);

                listed.push(section[1] + '.  ' + section[2]);

                if (lines[index + 1] !== under)
                {
                    say(file, 0, 'the contents\' ' + section[2] + ' has ' +
                        'no line of hyphens beneath it');
                }
            }
            else if (/^    \d+\.\s/.test(line))
            {
                entries.push(listed[listed.length - 1].split('.')[0]);
            }
        }

        if ( (listed.join('|') !== body.join('|'))  ||
             (entries.join('|') !== marks.join('|')) ||
             listed.some((_name) => _name !== _name.toUpperCase()) )
        {
            say(file, 0, 'the table of contents is not the body\'s ' +
                'sections, in capitals, with their entries');
        }

        // each entry by its number, and the first name it lists
        const named = new Map();
        let   at    = 0;
        let   count = 0;

        for (const line of lines)
        {
            const section = /^(\d+)\.\s/.exec(line);
            const entry   = /^    (\d+)\.\s+(\S+?),?(\s|$)/.exec(line);

            if (section !== null)
            {
                at    = Number(section[1]);
                count = 0;
            }
            else if (entry !== null)
            {
                named.set(at + '.' + (++count), entry[2]);
            }
        }

        // a marker heads the first thing declared after it
        const all = text.split('\n');

        for (const [index, line] of all.entries())
        {
            const marker = /^\/\/ (\d+\.\d+)$/.exec(line);

            if (marker === null)
            {
                continue;
            }

            let declared = null;

            for (let next = index + 1;
                 (next < all.length) && (declared === null);
                 ++next)
            {
                const found =
                    /^export (?:async )?(?:function|const|class) (\w+)/
                        .exec(all[next]) ??
                    /@typedef \{.*\} (\w+)$/.exec(all[next]);

                // a word the language keeps is exported as the word
                declared = (found === null) ? null
                                            : found[1].replace(/_$/, '');
            }

            if (named.get(marker[1]) !== declared)
            {
                say(file, index + 1, 'marker ' + marker[1] + ' heads ' +
                    declared + ', and its entry names ' +
                    named.get(marker[1]));
            }
        }
    }

    // a banner's lines of fixed geometry end on column 80, and it has all
    // five fields
    const all    = text.split('\n');
    const close  = all.findIndex((_line, _at) => (_at > 0) &&
                                 /^(\*{79}\/|-->|#{80})$/.test(_line));
    const banner = (close < 0) ? [] : all.slice(0, close + 1);

    if (/djinterp\.js( \[|  )/.test(banner.slice(0, 4).join('\n')))
    {
        for (const field of ['path:      /', 'link(s):   ', 'author(s): ',
                             'created: ', 'revised: '])
        {
            if (!banner.some((_line) => _line.includes(field)))
            {
                say(file, 1, 'the banner has no ' + field.trim());
            }
        }
    }

    for (const [index, line] of banner.entries())
    {
        const fixed = ( (index < 4) && /djinterp\.js( \[|  )/.test(line) ) ||
                      /(created|revised): \d{4}\.\d\d\.\d\d$/.test(line);

        if ( fixed &&
             ([...line].length !== 80) )
        {
            say(file, index + 1, 'a banner\'s line that ends on column ' +
                '80 ends on ' + [...line].length);
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
