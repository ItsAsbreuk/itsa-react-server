'use strict';

(function(args) {
    const watchBase = require('./webpack/watch-base');
    watchBase(false, args);
}(process.argv));