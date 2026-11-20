/*******************************************************************************
* djinterp.js [tools]                                             json_module.js
*
*   Wraps a generated JSON file as an ES module beside it, so that a page
* imports the data with no build step and no JSON-module support:
*     node tools/json_module.js generated/option.json
* writes generated/option.js, whose default export is the JSON's value. The
* JSON stays the generated data; the module is that file's bytes between
* two lines, and is never edited by hand either.
*
*
* path:      /tools/json_module.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { readFileSync, writeFileSync } from 'node:fs';

for (const path of process.argv.slice(2))
{
    const json = readFileSync(path, 'utf8');

    // refuse what is not JSON before wrapping it
    JSON.parse(json);

    writeFileSync(path.replace(/\.json$/, '.js'),
                  '// generated from ' + path.replace(/^.*\//, '') +
                  ' by tools/json_module.js; never edited by hand\n' +
                  'export default ' + json.trimEnd() + ';\n');
}
