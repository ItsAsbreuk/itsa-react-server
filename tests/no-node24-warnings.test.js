'use strict';

// The plugin gives the server a browser `window` (jsdom-global). React 16.14's scheduler takes its
// browser path as soon as `window` exists and MessageChannel is a function - a global since Node 15 -
// and then warns when `window.requestAnimationFrame` or `window.cancelAnimationFrame` is missing.
// Every app on Node 24 printed both warnings at startup; on Node 8 the scheduler never got there.

const {test} = require('node:test'),
    assert = require('node:assert'),
    path = require('path'),
    spawnSync = require('child_process').spawnSync,
    fixture = require('./helpers/fixture');

// Loads the plugin the way an app does, then react-dom (which loads the scheduler). A fresh process,
// because the warnings are printed only once: when the modules load.
const startupOutput = () => {
    const script = [
        'const fixture = require(' + JSON.stringify(path.join(__dirname, 'helpers', 'fixture')) + ');',
        'fixture.useFixture(\'plain\');',
        'require(fixture.REPO);',
        'require(\'react-dom\');',
        'console.log(\'react-dom loaded\');',
        'setImmediate(() => process.exit(0));'
    ].join('\n');
    return spawnSync(process.execPath, ['-e', script], {cwd: fixture.REPO, encoding: 'utf8', timeout: 60000});
};

test('loading the plugin and react-dom prints no requestAnimationFrame warnings', () => {
    const result = startupOutput();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /react-dom loaded/);
    assert.doesNotMatch(result.stderr, /requestAnimationFrame|cancelAnimationFrame/);
});

// jsdom 11 loaded `pn`, which copies `fs.F_OK` - deprecated (DEP0176) from Node 24 on
test('loading the plugin and react-dom prints no DeprecationWarning', () => {
    const result = startupOutput();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /react-dom loaded/);
    assert.doesNotMatch(result.stderr, /DeprecationWarning/);
});
