/*******************************************************************************
* djinterp.js [tools]                                                make_kit.js
*
*   Makes a kit of the port's commits for the owner's repository, which
* holds the port's trees and not its hashes (djinterp/djinterp.js on
* GitHub, made from the kit of 2026-11-18):
*     node tools/make_kit.js OUT NAME [FROM] [--tsc TSC]
*   For each commit after FROM up to HEAD (each from the first, where FROM
* is left out), OUT/NAME/steps/ gets a zip of the files it adds or
* changes, whole; a list of those it deletes; and its message as it was.
* Beside them go NAME.ps1, which is tools/kit/kit.ps1 filled in and makes
* the commits again, checking every tree; and README.txt, which is
* tools/kit/README.txt filled in, with a table of the steps. OUT/NAME.zip
* is the folder, zipped.
*   FROM is the commit whose tree the owner's repository has: the head of
* the last kit. Steps are numbered as commits are counted from the port's
* first, so the numbers go on from kit to kit.
*   Each step's gates run on its own tree, in a directory of its own: its
* tests; its style check, where it has one; and its type check, where it
* has one and TSC is given, as tools/check_types.js takes it. The README
* says what they found. Exits 1, writing nothing, where OUT/NAME is there
* already or the tree has changes not committed.
*
*
* path:      /tools/make_kit.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.20
*                                                            revised: 2026.11.20
*******************************************************************************/

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
         rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KIT  = join(ROOT, 'tools', 'kit');

const words = process.argv.slice(2);
const tsc   = (words.indexOf('--tsc') < 0)
    ? undefined
    : words.splice(words.indexOf('--tsc'), 2)[1];
const [out, name, from] = words;

if ( (out === undefined) ||
     (name === undefined) ||
     (words.length > 3) )
{
    console.error('usage: node tools/make_kit.js OUT NAME [FROM] [--tsc TSC]');
    process.exit(2);
}

/*
git
  What git writes, given its words, run in the repository; stops the tool
where git fails.
*/
function git(
    ..._words
)
{
    const run = spawnSync('git', ['-C', ROOT, ..._words],
                          { maxBuffer: 1 << 30 });

    if (run.status !== 0)
    {
        console.error('git ' + _words.join(' ') + ' failed:\n' +
                      String(run.stderr));
        process.exit(1);
    }

    return run.stdout;
}

/*
text
  What git writes, as text, without its last line break.
*/
function text(
    ..._words
)
{
    return String(git(..._words)).replace(/\n$/, '');
}

/*
wrap
  Words as lines of at most a width, each line begun with a lead.
*/
function wrap(
    _words,
    _lead,
    _width
)
{
    const lines = [];
    let   line  = '';

    for (const word of _words.split(/\s+/).filter((_word) => _word !== ''))
    {
        if ( (line !== '') &&
             ((_lead + line + ' ' + word).length > _width) )
        {
            lines.push(_lead + line);
            line = word;
        }
        else
        {
            line = (line === '') ? word : (line + ' ' + word);
        }
    }

    if (line !== '')
    {
        lines.push(_lead + line);
    }

    return lines.join('\n');
}

/*
zip
  A zip of files: each entry a path, its bytes, its mode and its time,
deflated, with its mode kept as a Unix tool keeps it.
*/
function zip(
    _entries
)
{
    const parts   = [];
    const central = [];
    let   offset  = 0;

    for (const entry of _entries)
    {
        const path  = Buffer.from(entry.path, 'utf8');
        const data  = deflateRawSync(entry.bytes, { level: 9 });
        const when  = entry.time;
        const time  = (when.getUTCHours() << 11) |
                      (when.getUTCMinutes() << 5) |
                      (when.getUTCSeconds() >> 1);
        const day   = ((when.getUTCFullYear() - 1980) << 9) |
                      ((when.getUTCMonth() + 1) << 5) |
                      when.getUTCDate();
        const check = crc32(entry.bytes);
        const local = Buffer.alloc(30);

        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(day, 12);
        local.writeUInt32LE(check, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(entry.bytes.length, 22);
        local.writeUInt16LE(path.length, 26);
        local.writeUInt16LE(0, 28);

        const head = Buffer.alloc(46);

        head.writeUInt32LE(0x02014b50, 0);
        head.writeUInt16LE((3 << 8) | 20, 4);
        head.writeUInt16LE(20, 6);
        head.writeUInt16LE(0x0800, 8);
        head.writeUInt16LE(8, 10);
        head.writeUInt16LE(time, 12);
        head.writeUInt16LE(day, 14);
        head.writeUInt32LE(check, 16);
        head.writeUInt32LE(data.length, 20);
        head.writeUInt32LE(entry.bytes.length, 24);
        head.writeUInt16LE(path.length, 28);
        head.writeUInt32LE(((entry.mode << 16) >>> 0), 38);
        head.writeUInt32LE(offset, 42);

        parts.push(local, path, data);
        central.push(head, path);
        offset += local.length + path.length + data.length;
    }

    const directory = Buffer.concat(central);
    const end       = Buffer.alloc(22);

    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(_entries.length, 8);
    end.writeUInt16LE(_entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...parts, directory, end]);
}

/*
gates
  A commit's gates, run on its tree in a directory of its own: what its
tests found, and whether its style and type checks pass, where it has
them ('-' where it has not, or no TSC was given).
*/
function gates(
    _commit
)
{
    const place = mkdtempSync(join(tmpdir(), 'djinterp-kit-'));
    const tar   = spawnSync('tar', ['-x', '-C', place],
                            { input: git('archive', '--format=tar', _commit),
                              maxBuffer: 1 << 30 });
    const found = { tests: '?', style: '-', types: '-' };

    if (tar.status === 0)
    {
        const run   = spawnSync(process.execPath, ['--test'],
                                { cwd: place, encoding: 'utf8',
                                  maxBuffer: 1 << 30 });
        const total = /^# tests (\d+)$/m.exec(run.stdout);
        const pass  = /^# pass (\d+)$/m.exec(run.stdout);

        found.tests = ( (total === null) || (pass === null) )
            ? '?'
            : (pass[1] + '/' + total[1]);
        found.fail = (run.status !== 0);

        if (existsSync(join(place, 'tools', 'check_style.js')))
        {
            found.style = (spawnSync(process.execPath,
                                     ['tools/check_style.js'],
                                     { cwd: place }).status === 0)
                ? 's' : 'S!';
        }

        if ( (tsc !== undefined) &&
             existsSync(join(place, 'tools', 'check_types.js')) )
        {
            found.types = (spawnSync(process.execPath,
                                     ['tools/check_types.js', tsc],
                                     { cwd: place }).status === 0)
                ? 't' : 'T!';
        }
    }

    rmSync(place, { recursive: true, force: true });

    return found;
}

if (text('status', '--porcelain', '--untracked-files=no') !== '')
{
    console.error('the tree has changes not committed; commit them first');
    process.exit(1);
}

const folder = join(out, name);

if (existsSync(folder))
{
    console.error(folder + ' is there already');
    process.exit(1);
}

// 1. the steps, from git
const commits = text('rev-list', '--reverse',
                     (from === undefined) ? 'HEAD' : (from + '..HEAD'))
    .split('\n').filter((_line) => _line !== '');
const first   = (from === undefined)
    ? 1
    : (Number(text('rev-list', '--count', from)) + 1);

if (commits.length === 0)
{
    console.error('no commit after ' + from);
    process.exit(1);
}

const steps = commits.map((_commit, _index) =>
{
    const subject = text('log', '-1', '--format=%s', _commit);
    let   slug    = '';

    for (const word of subject.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    {
        if ((slug.length + word.length + 1) > 34)
        {
            break;
        }

        slug = (slug === '') ? word : (slug + '_' + word);
    }

    const raw     = git('cat-file', 'commit', _commit);
    const blank   = raw.indexOf('\n\n');
    const changes = text('diff-tree', '-r', '--no-renames', '--root',
                         '--no-commit-id', _commit)
        .split('\n').filter((_line) => _line !== '')
        .map((_line) =>
        {
            const [meta, path] = _line.split('\t');
            const fields       = meta.slice(1).split(' ');

            return { was: fields[0], mode: fields[1], status: fields[4],
                     path: path };
        });

    for (const change of changes)
    {
        // a file that stops being executable would need its own step in
        // the script; none has
        if ( !['A', 'M', 'D', 'T'].includes(change.status) ||
             ( (change.was === '100755') && (change.mode === '100644') ) ||
             change.path.split('/').includes('..') )
        {
            console.error(_commit + ': ' + change.status + ' ' +
                          change.path + ' is not one a kit can carry');
            process.exit(1);
        }
    }

    return {
        number:  first + _index,
        commit:  _commit,
        subject: subject,
        name:    String(first + _index).padStart(2, '0') + '_' + slug,
        message: raw.subarray(blank + 2),
        time:    new Date(Number(text('log', '-1', '--format=%at',
                                      _commit)) * 1000),
        written: changes.filter((_change) => _change.status !== 'D'),
        deleted: changes.filter((_change) => _change.status === 'D')
                        .map((_change) => _change.path),
        tree:    text('rev-parse', _commit + '^{tree}')
    };
});

// 2. each step's files
mkdirSync(join(folder, 'steps'), { recursive: true });

for (const step of steps)
{
    writeFileSync(join(folder, 'steps', step.name + '.zip'),
                  zip(step.written.map((_change) => ({
                      path:  _change.path,
                      bytes: git('cat-file', 'blob',
                                 step.commit + ':' + _change.path),
                      mode:  (_change.mode === '100755') ? 0o100755
                                                         : 0o100644,
                      time:  step.time }))));
    writeFileSync(join(folder, 'steps', 'commit_' + step.name + '.txt'),
                  step.message);

    if (step.deleted.length !== 0)
    {
        writeFileSync(join(folder, 'steps', step.name + '_deletions.txt'),
                      step.deleted.join('\n') + '\n');
    }
}

// 3. the gates, and the table of steps
const rows = [];
let   held = true;

for (const step of steps)
{
    const found   = gates(step.commit);
    const marks   = found.tests + ' ' +
                    [found.style, found.types].filter((_mark) =>
                        _mark !== '-').join(' ');
    let   files   = String(step.written.length);
    let   subject = step.subject;

    held = held && !found.fail && !found.style.endsWith('!') &&
           !found.types.endsWith('!') && (found.tests !== '?');

    if (step.deleted.length !== 0)
    {
        files += ', -' + step.deleted.length;
    }

    const lead = String(step.number).padStart(3) + '  ' +
                 step.commit.slice(0, 7) + '  ' + files.padEnd(9) + ' ' +
                 marks.trimEnd().padEnd(10);

    if ((lead.length + subject.length) > 79)
    {
        subject = subject.slice(0, 78 - lead.length);
        subject = subject.slice(0, subject.lastIndexOf(' ')) + ' ~';
    }

    rows.push(lead + subject);
    console.log(lead + subject);
}

// 4. the script and the README
const last    = steps.at(-1);
const before  = (from === undefined) ? '' : text('rev-parse', from + '^{tree}');
const deletes = steps.filter((_step) => _step.deleted.length !== 0)
                     .map((_step) => _step.number);
const runs    = [...new Set(steps.flatMap((_step) =>
    _step.written.filter((_change) => _change.mode === '100755')
                 .map((_change) => _change.path)))];
const start   = (from === undefined)
    ? ('It reads where to start from the repository. No folder there, or ' +
       'an empty one, becomes a new repository on main and gets every ' +
       'step; a repository whose HEAD has the tree of one of the steps (a ' +
       'clone of an earlier djinterp.js zip, or this kit stopped part ' +
       'way) gets the steps after it.')
    : ('It reads where to start from the repository, whose HEAD must have ' +
       'the tree of step ' + (first - 1) + ' (the port\'s ' +
       from.slice(0, 7) + ', where the last kit ended) or of a step here; ' +
       'it makes the steps after it. It does not start a repository: that ' +
       'takes a kit from step 1.');
let   files   = (deletes.length === 0)
    ? ' No step here deletes.'
    : (' ' + ((deletes.length === 1) ? 'Step ' : 'Steps ') +
       deletes.join(', ') + ' delete.');

if (runs.length !== 0)
{
    files += ' ' + runs.join(' and ') + ' ' +
             ((runs.length === 1) ? 'is' : 'are') +
             ' made executable in the index, as on Linux.';
}

const checked = 'its tests (node --test), its style check where it has ' +
                'one' + ((tsc === undefined)
                    ? '; the type check was not run'
                    : ', and its type check where it has one (TypeScript, ' +
                      'strict)');
const said    = held
    ? ('Every step passed its gates on its own tree: ' + checked + '.')
    : ('Not every step passed its gates (marked ! or with tests failing ' +
       'below): ' + checked + '.');
const table   = steps.map((_step) =>
{
    const run = runs.filter((_path) =>
        _step.written.some((_change) => (_change.path === _path)));

    return '    @{ Name = \'' + _step.name + '\'\n' +
           '       Tree = \'' + _step.tree + '\'\n' +
           '       Deletions = $' + String(_step.deleted.length !== 0) +
           '; Exec = @(' + run.map((_path) => '\'' + _path + '\'')
                              .join(', ') + ') }';
}).join(',\n');

/*
fill
  A template with the kit's own words in it.
*/
function fill(
    _template
)
{
    return _template
        .replaceAll('@@NAME@@', name)
        .replaceAll('@@FIRST@@', String(first))
        .replaceAll('@@LAST@@', String(last.number))
        .replaceAll('@@HEAD@@', last.commit.slice(0, 7))
        .replaceAll('@@BEFORE@@', before);
}

const script = readFileSync(join(KIT, 'kit.ps1'), 'utf8').split('\n');
const body   = script.slice(script.findIndex((_line, _at) =>
                   (_at > 0) && /^#{80}$/.test(_line)) + 1).join('\n');

writeFileSync(join(folder, name + '.ps1'),
              fill(body).replace('@@START@@', wrap(start, '# ', 74))
                        .replace('@@STEPS@@', table));
writeFileSync(join(folder, 'README.txt'),
              fill(readFileSync(join(KIT, 'README.txt'), 'utf8'))
                  .replace('@@START@@', wrap(start, '', 72))
                  .replace('@@FILES@@',
                           wrap('Each step is in steps/: NN_name.zip, the ' +
                                'files the commit adds or changes, whole; ' +
                                'commit_NN_name.txt, its message; and, ' +
                                'where it deletes, NN_name_deletions.txt.' +
                                files, '', 72))
                  .replace('@@GATES@@', wrap(said, '', 72))
                  .replace('@@TABLE@@', rows.join('\n'))
                  .replaceAll('\n', '\r\n'));

// 5. the folder, zipped
const listed = [];

for (const entry of readdirSync(folder, { recursive: true,
                                          withFileTypes: true })
                       .filter((_entry) => _entry.isFile()))
{
    const path = join(entry.parentPath, entry.name);

    listed.push({ path:  name + '/' + relative(folder, path).split('\\')
                                                         .join('/'),
                  bytes: readFileSync(path),
                  mode:  0o100644,
                  time:  last.time });
}

listed.sort((_one, _other) => (_one.path < _other.path) ? -1 : 1);
writeFileSync(join(out, name + '.zip'), zip(listed));
console.log(steps.length + ' steps, ' + first + ' to ' + last.number +
            '; ' + join(out, name + '.zip'));
