/*******************************************************************************
* djinterp.js [tools]                                              check_page.js
*
*   Opens examples/console.html in a browser, twice with one profile, and
* says whether the page did what the port does under node:
*     node tools/check_page.js BASE PLAYWRIGHT [CHROME]
*   BASE is where a static file server serves this repository, such as
* http://127.0.0.1:8765 for `python3 -m http.server 8765` run at its top.
* PLAYWRIGHT is the path of playwright's `index.mjs`; CHROME, the path of
* a browser for it to drive where it is not to use its own.
*   The repository depends on neither, and `node --test` does not run
* this: it is the one check that needs a browser.
*   The first opening binds the URL's query, runs a `set`, and reads back
* what was kept in the page's localStorage; the second, with nothing in
* its URL, reads those settings as the file's. Exits 1 where either
* differs from what is written here, or the page reported an error.
*
*
* path:      /tools/check_page.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { pathToFileURL } from 'node:url';

const [base, playwright, chrome] = process.argv.slice(2);

if ( (base === undefined) ||
     (playwright === undefined) )
{
    console.error('usage: node tools/check_page.js BASE PLAYWRIGHT [CHROME]');
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
const STORED = 'printer.style = json\ntitle = two words\n';

const { chromium } = await import(pathToFileURL(playwright).href);
const browser      = await chromium.launch(
                         (chrome !== undefined) ? { executablePath: chrome }
                                                : {});
const context      = await browser.newContext();
let   problems     = 0;

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

for (const visit of VISITS)
{
    const page   = await context.newPage();
    const errors = [];

    page.on('pageerror', (_error) => errors.push(String(_error)));
    await page.goto(visit.url);
    await page.waitForSelector('body[data-ready=yes]', { timeout: 10000 });

    same(visit.url, await page.locator('#out').textContent(), visit.want);
    same('what was heard', await page.locator('#heard').textContent(),
         visit.heard);
    same('what was kept',
         await page.evaluate(() => localStorage.getItem('djinterp/settings')),
         STORED);
    same('the page\'s errors', errors.join('\n'), '');
    await page.close();
}

console.log(await browser.version() + ': ' +
            ((problems === 0) ? 'the page does as the port does'
                              : (problems + ' differ')));
await browser.close();
process.exit((problems === 0) ? 0 : 1);
