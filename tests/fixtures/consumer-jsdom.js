'use strict';

// Stands in for the jsdom an app has at the top of its node_modules (see tests/no-node24-warnings.test.js).
// It flags that it was used and hands out this repository's own jsdom, so the plugin still starts.

global.__consumerJsdomUsed = true;
module.exports = require('../../node_modules/jsdom');
