'use strict';

// The plugin gives the server a browser `window` (jsdom). React 16.14's scheduler takes its
// browser path as soon as `window` exists and MessageChannel is a function - a global since Node 15 -
// and then warns when `window.requestAnimationFrame` or `window.cancelAnimationFrame` is missing.
// Every app on Node 24 printed both warnings at startup; on Node 8 the scheduler never got there.

const {test} = require('node:test'),
    assert = require('node:assert'),
    path = require('path'),
    spawnSync = require('child_process').spawnSync,
    fixture = require('./helpers/fixture');

// In an app, npm puts jsdom-global at the top of node_modules, next to whatever jsdom the app has there
// (jest 22 brings jsdom 11, whose `pn` prints DEP0176), and nests this package's own jsdom. jsdom-global only
// peer-depends on jsdom, so it gets the app's. This hook recreates that layout: every `require('jsdom')` from
// outside lib/ gets tests/fixtures/consumer-jsdom.js, which flags that it was used.
const CONSUMER_LAYOUT = [
    'const Module = require(\'module\'),',
    '    LIB = ' + JSON.stringify(path.join(fixture.REPO, 'lib') + path.sep) + ',',
    '    CONSUMER_JSDOM = ' + JSON.stringify(path.join(__dirname, 'fixtures', 'consumer-jsdom.js')) + ',',
    '    resolveFilename = Module._resolveFilename;',
    'Module._resolveFilename = function(request, parent, ...rest) {',
    '    if ((request===\'jsdom\') && !(parent && parent.filename && parent.filename.startsWith(LIB))) {',
    '        return CONSUMER_JSDOM;',
    '    }',
    '    return resolveFilename.call(this, request, parent, ...rest);',
    '};'
];

// Loads the plugin the way an app does, then react-dom (which loads the scheduler). A fresh process,
// because the warnings are printed only once: when the modules load.
const startupOutput = (preamble = []) => {
    const script = preamble.concat([
        'const fixture = require(' + JSON.stringify(path.join(__dirname, 'helpers', 'fixture')) + ');',
        'fixture.useFixture(\'plain\');',
        'require(fixture.REPO);',
        'console.log(\'consumer jsdom used: \' + !!global.__consumerJsdomUsed);',
        'require(\'react-dom\');',
        'console.log(\'react-dom loaded\');',
        'setImmediate(() => process.exit(0));'
    ]).join('\n');
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

test('in an app the window comes from this package\'s own jsdom, not from the one at the top of node_modules', () => {
    const result = startupOutput(CONSUMER_LAYOUT);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /react-dom loaded/);
    assert.match(result.stdout, /consumer jsdom used: false/);
});
