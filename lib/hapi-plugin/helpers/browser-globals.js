/**
 *
 * <i>Copyright (c) 2017 ItsAsbreuk - http://itsasbreuk.nl</i><br>
 * New BSD License - http://choosealicense.com/licenses/bsd-3-clause/
 *
 *
 * @since 18.0.2
*/

'use strict';

// Gives the server the browser globals (`window`, `document`, `navigator` etc.) the views expect - what
// jsdom-global did, but with this package's own jsdom. jsdom-global only peer-depends on jsdom, so in an app
// it takes whatever jsdom sits at the top of node_modules (jest 22 brings jsdom 11, whose `pn` prints DEP0176
// on Node 24). From here, `require('jsdom')` always resolves to the jsdom in this package's dependencies.
//
// `pretendToBeVisual` gives the window requestAnimationFrame and cancelAnimationFrame: React's scheduler reads
// them from `window` and warns without them from Node 15 on (MessageChannel).

const JSDOM = require('jsdom').JSDOM,
    KEYS = require('jsdom-global/keys'),
    HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

const installBrowserGlobals = () => {
    const window = new JSDOM(HTML, {pretendToBeVisual: true}).window;
    KEYS.forEach(key => {
        try {
            global[key] = window[key];
        }
        catch (err) {
            // a read-only global of Node itself (`navigator` from Node 21 on) keeps Node's value, as it did
            // under jsdom-global, whose non-strict assignment failed silently
        }
    });
    global.document = window.document;
    global.window = window;
    window.console = global.console;
};

module.exports = installBrowserGlobals;
