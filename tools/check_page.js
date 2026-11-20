/*******************************************************************************
* djinterp.js [tools]                                              check_page.js
*
*   Opens examples/console.html in a browser, twice with one profile, and
* says whether the page did what the port does under node:
*     node tools/check_page.js BASE [CHROME]
*   BASE is where a static file server serves this repository, such as
* http://127.0.0.1:8765. CHROME is a Chrome or Chromium to run;
* `google-chrome` where left out. It is run headless and asked for the
* page as it stands once its script has finished; nothing drives it.
*   `node --test` does not run this: it is the one check that needs a
* browser.
*   The first opening binds the URL's query and runs a `set`, which the
* page keeps in its localStorage; the second, with nothing in its URL's
* query, reads those settings as the file's. Exits 1 where either differs
* from what is written here.
*
*
* path:      /tools/check_page.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.16
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [base, chrome = 'google-chrome'] = process.argv.slice(2);

if (base === undefined)
{
    console.error('usage: node tools/check_page.js BASE [CHROME]');
    process.exit(2);
}

const PAGE   = base + '/examples/console.html';
const VISITS = [
    {
        url:  PAGE + '?printer.key_width=40&nothing=1' +
              '#get --show-origin printer.key_width' +
              '|set printer.style=json title="two words"|get',
        want: 'djinterp: warning: query: --set: no setting is named ' +
              '\'nothing\'\n' +
              '> get --show-origin printer.key_width\n' +
              'printer.key_width = 40  (command line)\n' +
              '    default    30   (default)\n' +
              '> set printer.style=json title="two words"\n' +
              '> get\n' +
              'color = true\ntitle = two words\nprinter.style = json\n' +
              'printer.key_width = 40\n',
        heard: 'set: printer.style, title'
    },
    {
        url:  PAGE + '#get --show-origin',
        want: '> get --show-origin\n' +
              'color = true  (default)\n' +
              'title = two words  (file)\n' +
              '    default    unset   (default)\n' +
              'printer.style = json  (file)\n' +
              '    default    plain   (default)\n' +
              'printer.key_width = 30  (default)\n',
        heard: ''
    }
];
/*
text_of
  The text of the element with an id, in a page as the browser wrote it
out: its tags gone, its character references read.
*/
function text_of(
    _page,
    _id
)
{
    const found = new RegExp('<(\\w+) id="' + _id + '"[^>]*>([^]*?)</\\1>')
                      .exec(_page);

    if (found === null)
    {
        return null;
    }

    return found[2].replace(/<[^>]*>/g, '')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, '\'')
                   .replace(/&amp;/g, '&');
}

let problems = 0;

/*
same
  Says one comparison; counts it where it differs.
*/
function same(
    _what,
    _got,
    _want
)
{
    if (_got !== _want)
    {
        console.log(_what + ' differs:\n' + JSON.stringify(_got) +
                    '\nwanted:\n' + JSON.stringify(_want));
        ++problems;
    }

    return;
}

const profile = mkdtempSync(join(tmpdir(), 'djinterp.js-page-'));
let   version = '';

try
{
    version = spawnSync(chrome, ['--version']).stdout.toString().trim();

    for (const visit of VISITS)
    {
        // a browser run as root wants to be told it has no sandbox
        const run = spawnSync(chrome, [
            '--headless=new', '--disable-gpu',
            ...((process.getuid?.() === 0) ? ['--no-sandbox'] : []),
            '--user-data-dir=' + profile, '--virtual-time-budget=10000',
            '--dump-dom', encodeURI(visit.url)
        ], { maxBuffer: 1 << 26 });

        const page = (run.stdout ?? '').toString();

        same('whether the page finished: ' + visit.url,
             /<body[^>]*data-ready="yes"/.test(page), true);
        same(visit.url, text_of(page, 'out'), visit.want);
        same('what was heard', text_of(page, 'heard'), visit.heard);
    }
}
finally
{
    rmSync(profile, { recursive: true, force: true });
}

console.log(version + ': ' +
            ((problems === 0) ? 'the page does as the port does'
                              : (problems + ' differ')));
process.exit((problems === 0) ? 0 : 1);
