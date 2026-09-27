'use strict';

// The Chunks plugin writes build.tmp/build-stats.json after every compile; for the common chunk it looks up
// the module of the app. It read `chunk.modules`, which webpack 3 deprecates: every `npm run watch` and
// build printed "DeprecationWarning: Chunk.modules is deprecated".

const {test} = require('node:test'),
    assert = require('node:assert'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    spawnSync = require('child_process').spawnSync,
    REPO = path.resolve(__dirname, '..');

// Runs the plugin's after-compile step on a real webpack Chunk, in a fresh process (webpack prints a
// deprecation only once) whose cwd is an empty app dir, because the plugin reads process.cwd() when it loads.
const afterCompile = appDir => {
    const script = [
        'const path = require(\'path\'),',
        '    Chunk = require(' + JSON.stringify(path.join(REPO, 'node_modules', 'webpack', 'lib', 'Chunk')) + '),',
        '    MainPagePlugin = require(' + JSON.stringify(path.join(REPO, 'lib', 'webpack', 'main-page-plugin')) + '),',
        '    hooks = {},',
        '    plugin = new MainPagePlugin.Chunks({app: \'src/app.js\'}),',
        '    common = new Chunk(\'common\');',
        'plugin.apply({options: {entry: {}}, plugin: (name, fn) => { hooks[name] = fn; }});',
        'common.addModule({id: 3, resource: path.resolve(\'src/other.js\')});',
        'common.addModule({id: 7, resource: path.resolve(\'src/app.js\')});',
        'common.renderedHash = \'abc\';',
        'hooks[\'after-compile\']({chunks: [common]}, () => {',
        '    console.log(\'after-compile done\');',
        '    setImmediate(() => process.exit(0));',
        '});'
    ].join('\n');
    return spawnSync(process.execPath, ['-e', script], {cwd: appDir, encoding: 'utf8', timeout: 60000});
};

test('the Chunks plugin finds the app module of the common chunk without the deprecated Chunk.modules', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itsa-main-page-plugin-'));
    try {
        fs.mkdirSync(path.join(appDir, 'build.tmp'));
        const result = afterCompile(appDir);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.match(result.stdout, /after-compile done/);
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(appDir, 'build.tmp', 'build-stats.json'), 'utf8')),
            [{isCommon: true, requireId: 7, hash: 'abc'}]);
        assert.doesNotMatch(result.stderr, /DeprecationWarning/);
    }
    finally {
        fs.rmSync(appDir, {recursive: true, force: true});
    }
});
