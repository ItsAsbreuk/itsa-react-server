/*eslint no-empty: 0*/
/*eslint no-cond-assign: 0*/
'use strict';

let GLOBAL_ASSETS = {
        JS: {},
        CSS: {},
        INLINECSS: {}
    },
    GLOBAL_MODELS = {},
    GLOBAL_VIEWS = {},
    clientRoutes = {
        desktop: [],
        tablet: [],
        phone: []
    },
    VIEW_COMPONENT_NRS = {},
    APP_TITELS = {},
    DEFINED_VIEWS = {},
    REGEXP_TS = /_ts=\d+/,
    appConfig, packageVersion;

const fs = require('fs-extra'),
      fsp = require('fs-promise'),
      reload = require('require-reload')(require), // see https://github.com/fastest963/require-reload
      cwd = process.cwd(),
      Vision = require('vision'),
      Inert = require('inert'),
      Contextualizer = require('./contextualizer'),
      ItsaJsxView = require('./itsa-jsx-view'),
      useragent = require('useragent'),
      FILE404 = 'file404.html';


const applyVersion = () => {
    return fsp.readJson(cwd+'/package.json').then(packageConfig => {
        const changed = (packageConfig.version!==packageVersion);
        packageVersion = packageConfig.version;
        return changed;
    });
};

const applyTitles = () => {
    let prefix = '/versions/'+packageVersion,
        titlesDir = cwd+prefix+'/pagetitles/',
        langKeys = Object.keys(appConfig.languages);

    langKeys.forEach(lang => {
        if (appConfig.languages[lang]!==false) {
            try {
                let titles = fs.readJsonSync(titlesDir+lang+'.json', {throws: false});
                let keys = Object.keys(titles);
                keys.forEach(key => {
                    APP_TITELS[key] || (APP_TITELS[key]={});
                    APP_TITELS[key][lang] = titles[key];
                });
            }
            catch(err) {}
        }
    });
};

const applyClientRoutes = () => {
    let prefix = '/versions/'+packageVersion;
    const routes = reload(cwd+prefix+'/routes.js');
    const fakereply = {
        reactview(view, config) {
            this.view = view;
            this.staticView = config ? !!config.staticView : false;
        }
    };
    const getRouteReactView = route => {
        if (route.method.toUpperCase()!=='GET') {
            return;
        }
        if (typeof route.handler!=='function') {
            return;
        }
        // now fake the handler. If an error occurs, then there is no valid reactview-route
        delete fakereply.view;
        delete fakereply.staticView;
        try {
            route.handler({}, fakereply);
        }
        catch(e) {}
        return {
            view: fakereply.view,
            staticView: fakereply.staticView
        };
    };
    routes.forEach(route => {
        let affinityCompNr, affinityTitles;
        const routeReactView = getRouteReactView(route);
        if (routeReactView) {
            affinityCompNr = VIEW_COMPONENT_NRS[routeReactView.view];
            // only at the start: check if this serverroute is valid
            if (affinityCompNr) {
                affinityTitles = APP_TITELS[routeReactView.view];
                clientRoutes.desktop.push({
                    path: route.path,
                    view: routeReactView.view,
                    staticView: routeReactView.staticView,
                    title: affinityTitles,
                    componentId: affinityCompNr.componentId,
                    requireId: affinityCompNr.requireId
                });
                affinityCompNr = VIEW_COMPONENT_NRS[routeReactView.view+'@tablet'] || affinityCompNr;
                affinityTitles = APP_TITELS[routeReactView.view+'@tablet'] || affinityTitles;
                clientRoutes.tablet.push({
                    path: route.path,
                    view: routeReactView.view,
                    staticView: routeReactView.staticView,
                    title: affinityTitles,
                    componentId: affinityCompNr.componentId,
                    requireId: affinityCompNr.requireId
                });
                affinityCompNr = VIEW_COMPONENT_NRS[routeReactView.view+'@phone'] || affinityCompNr;
                affinityTitles = APP_TITELS[routeReactView.view+'@phone'] || affinityTitles;
                clientRoutes.phone.push({
                    path: route.path,
                    view: routeReactView.view,
                    staticView: routeReactView.staticView,
                    title: affinityTitles,
                    componentId: affinityCompNr.componentId,
                    requireId: affinityCompNr.requireId
                });
            }
        }
    });
};

const setMiddleware = server => {
    const serverConnection = server.root;

    serverConnection.ext('onRequest', function (request, reply) {
        let path, secondSlash, possibleLang, acceptLanguage, acceptLanguages, qualityDivider, languageLength;

        // setting middleware for defining :
        request.affinity = ((appConfig.device==='phone') || (appConfig.device==='tablet')) ?
                           appConfig.device :
                           Contextualizer.getDevice(request.headers['user-agent']);

        // setting middleware for defining language:
        path = request.path;
        secondSlash = path.indexOf('/', 1);

        possibleLang = (secondSlash!==-1) ? path.substring(1, secondSlash) : path.substring(1);
        if (appConfig.languages[possibleLang]) {
            request.language = possibleLang;
            request.locales = [possibleLang];
            if (secondSlash!==-1) {
                request.path = request.path.substr(secondSlash);
                request.url.pathname = request.url.pathname.substr(secondSlash);
                request.url.path = request.url.path.substr(secondSlash);
                request.url.href = request.url.href.substr(secondSlash);
            }
            else {
                languageLength = path.length;
                request.path = '/' + request.path.substr(languageLength);
                request.url.pathname = '/' +request.url.pathname.substr(languageLength);
                request.url.path = '/' + request.url.path.substr(languageLength);
                request.url.href = '/' + request.url.href.substr(languageLength);
            }

            // set languageSwitch whenever the language differs from the clients default
            request.languageSwitch = true;
            return reply.continue();
        }

        acceptLanguage = request.headers['accept-language'];
        acceptLanguages = acceptLanguage.split(',');
        // no language forced by url --> check the language from the request
        acceptLanguages.some(lang => {
            lang = lang.trim();
            qualityDivider = acceptLanguage.indexOf(';');
            if (qualityDivider>-1) {
                lang = lang.substr(0, qualityDivider);
            }
            possibleLang = lang.split('-')[0];
            if (appConfig.languages[possibleLang]) {
                request.language = possibleLang;
                request.locales = [lang];
            }
            return request.language;
        });
        request.language || (request.language=appConfig.defaultLanguage);
        request.locales || (request.locales=[appConfig.defaultLanguage]);
        return reply.continue();
    });

};

const setRoutes = server => {
    let prefix = '/versions/'+packageVersion;
    const routes = reload(cwd+prefix+'/routes.js'),
          serverConnection = server.root;
    routes.push({
        method: 'GET',
        path: '/favicon.ico',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/favicon.ico');
        }
    });
    routes.push({
        method: 'GET',
        path: '/{scriptfile}-{version}.js',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/js/viewapps/'+request.params.scriptfile+'.js');
        }
    });
    // routes.push({
    //     method: 'GET',
    //     path: '/assets/{version}/js/components/{chunkfile}.js',
    //     handler(request, reply) {
    //         reply.file(cwd+'/versions/'+request.params.version+'/assets/js/components/'+request.params.chunkfile+'.js');
    //     }
    // });
    routes.push({
        method: 'GET',
        path: '/common/main-{version}.js',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/js/common/main.js');
        }
    });
    routes.push({
        method: 'GET',
        path: '/page/{cssfile}-{version}.css',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/css/'+request.params.cssfile+'.css');
        }
    });
    routes.push({
        method: 'GET',
        path: '/{cssfile}-{version}.css',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/css/'+request.params.cssfile+'.css');
        }
    });
    // routes.push({
    //     method: 'GET',
    //     path: '/commons/commons-{version}.css',
    //     handler(request, reply) {
    //         reply.file(cwd+'/versions/'+request.params.version+'/assets/css/commons/commons.css');
    //     }
    // });
    routes.push({
        method: 'GET',
        path: '/assets/{version}/{filename}',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/'+request.params.filename);
        }
    });
    routes.push({
        method: 'GET',
        path: '/page/{version}/{filename}',
        handler(request, reply) {
            reply.file(cwd+'/versions/'+request.params.version+'/assets/'+request.params.filename);
        }
    });
    serverConnection.route(routes);
    serverConnection.routes = {
        prefix
    };
    return Promise.resolve();
};

const applyConfig = config => {
    const args = process.argv,
          arg = args[2],
          env = arg ? config.environments[arg] || {} : {};

    appConfig = Object.assign(config, env);
    appConfig.envName = arg || 'production';
    return Promise.resolve();
};

const get404File = () => {
    return new Promise((resolve, reject) => {
        const file404 = cwd+'/versions/'+packageVersion+'/'+FILE404;
        fsp.readFile(file404).then(
            () => resolve(file404),
            () => reject()
        );
    });
};

const initServer = (server, options) => {
    let prefix = '/versions/'+packageVersion,
        views, engines;
    const serverConnection = server.root,
          extraEngines = options.engines;

    serverConnection.connection({
        host: 'localhost',
        port: appConfig.port
    });

    views = {
        defaultExtension: 'js',
        engines: {
            js: ItsaJsxView.View // support for .js
        },
        relativeTo: cwd+prefix,
        path: 'views'
    };

    if (extraEngines) {
        engines = Object.keys(extraEngines);
        engines.forEach(enginename => (enginename!=='js') && (views.engines[enginename]=extraEngines[enginename]));
    }

    serverConnection.views(views);

    // DO NOT use arrowfunction here: we need the former context
    server.decorate('reply', 'action', function(action, options) {
        console.log('reply.action '+action);
        this.response('reply.action '+action);
    });

    // DO NOT use arrowfunction here: we need the former context
    server.decorate('reply', 'reactview', function(view, config) {
        let modelConfig, context, title, viewport, charset, description, clientLang, affinityTitle, urisplit;
        const request = this.request;
        const reply = this;

        // ES6 destructering not working yet??
        config || (config={});
        modelConfig = config.modelConfig;
        context = config.props || {};
        description = config.description || appConfig['page-description'] || '';

        viewport = config.viewport;
        charset = config.charset || 'utf-8';

        // set context.__lang and __locales for usage inside templates
        // if request.headers['x-lang'] then the client forces the language to be re-set
        clientLang = request.headers['x-lang'];
        // check if it is a valid langage
        if (clientLang && !appConfig.languages[clientLang]) {
            clientLang = null; // undo
        }
        context.__lang = clientLang || this.request.language;
        context.__langprefix = this.request.languageSwitch ? '/'+context.__lang : '';
        context.__locales = this.request.locales || appConfig.defaultLanguage;
        // set the tile in the right language
        if (this.request.affinity==='phone') {
            affinityTitle = APP_TITELS[view+'@phone'];
        }
        if (!affinityTitle && (this.request.affinity==='tablet')) {
            affinityTitle = APP_TITELS[view+'@tablet'];
        }
        if (!affinityTitle) {
            affinityTitle = APP_TITELS[view];
        }

        title = affinityTitle ? (affinityTitle[context.__lang] || '') : '';
        // set context.__view so it can be used inside the template:
        context.__view = view;
        // set context.__device so it can be used inside the template:
        context.__device = this.request.affinity;
        // set the page-title:
        context.__title = title;
        // set the meta-description:
        context.__description = description;
        // set the charset:
        context.__charset = charset;
        // set the useragent:
        context.__useragent = useragent.parse(request.headers['user-agent'] || '');
        // set the sessiontime:
        context.__sessiontime = appConfig.sessiontime || 0;
        // set the uri:
        // if the uri contains clientside timestamp, then remove it: we don't want to keep it
        context.__uri = request.url.path.replace(REGEXP_TS, '');
        if (context.__uri.endsWith('\?') || context.__uri.endsWith('&')) {
            context.__uri = context.__uri.substr(0, context.__uri.length-1);
        }
        // set the pathh, defined as uri without `?`:
        urisplit = context.__uri.split['?'];
        context.__path = urisplit ? urisplit[0] : context.__uri;

        // set google-analytics:
        context.__ga = appConfig['google-analytics'];
        // set the meta-viewport
        context.__viewport = viewport ? viewport[request.affinity] : appConfig['meta-viewport'][request.affinity];
        // set the react-routes to be available on the client:
        context.__routes = clientRoutes[this.request.affinity];
        // set the available languages
        context.__languages = appConfig.languages;
        // set whether this route is a static view
        context.__staticView = !!config.staticView;
        // set modelcontext and assetscontext for usage inside templates:
        getAffinityView(view, request.affinity)
        .then(mergeAssets.bind(null, context)) // second argument will be `affinityView` from `getAffinityView`
        .then(mergeModel.bind(null, this.request, context, modelConfig, view)) // fifth argument will be `affinityView` from `getAffinityView`
        .then(
            affinityView => {
                if (request.headers['x-comp']) {
                    fsp.readFile(cwd+'/versions/'+packageVersion+'/assets/js/components/'+VIEW_COMPONENT_NRS[affinityView].componentId+'.js', 'utf8')
                    .catch(
                        () => {console.log('fase 6');return '';}
                    )
                    .then(
                        data => reply(data)
                    );
                }
                else if (request.headers['x-css']) {
                    fsp.readFile(cwd+'/versions/'+packageVersion+'/assets/css/'+affinityView+'.css', 'utf8')
                    .catch(
                        () => {return '';}
                    )
                    .then(
                        data => reply(data)
                    );
                }
                else if (request.headers['x-props']) {
                    reply(context);
                }
                else {
                    if (DEFINED_VIEWS[affinityView]===true) {
                        this.view(affinityView, context);
                    }
                    else {
                        if (DEFINED_VIEWS[affinityView]===undefined) {
                            fsp.stat(cwd+'/versions/'+packageVersion+'/views/'+affinityView+'.js').then(
                                () => {
                                    DEFINED_VIEWS[affinityView] = true;
                                    this.view(affinityView, context);
                                },
                                () => {
                                    DEFINED_VIEWS[affinityView] = false;
                                    get404File().then(
                                        file404 => reply.file(file404).code(404),
                                        () => reply().code(404)
                                    );
                                }
                            );
                        }
                        else {
                            get404File().then(
                                file404 => reply.file(file404).code(404),
                                () => reply().code(404)
                            );
                        }
                    }
                }
            },
            (err) => {
                console.warn(err);
                reply(err);
            }
        );
    });

    // store the information whether 'languages' and 'affinity' is being used
    // in which case we need to define middleware
    return checkLanguages();
};

const getAffinityView = (view, device) => {
    const getView = (level) => {
        let affinity, viewAffinity;
        if (level===2) {
            affinity = '';
        }
        else if (level===1) {
            affinity = (device==='phone') ? '@tablet' : '';
        }
        else {
            affinity = (device==='desktop') ? '' : '@'+device;
        }
        viewAffinity = view+affinity;
        if (GLOBAL_VIEWS[viewAffinity]!==undefined) {
            return Promise.resolve(GLOBAL_VIEWS[viewAffinity]);
        }
        const viewFile = cwd+'/versions/'+packageVersion+'/views/'+viewAffinity+'.js';
        return fsp.stat(viewFile).then(
            function() {
                GLOBAL_VIEWS[viewAffinity] = viewAffinity;
                return GLOBAL_VIEWS[viewAffinity];
            },
            function() {
                GLOBAL_VIEWS[viewAffinity] = false;
            }
        );

    };

    return getView(0).then(viewname => {
        if (!viewname) {
            return getView(1);
        }
        return viewname;
    })
    .then(viewname => {
        if (!viewname) {
            return getView(2);
        }
        return viewname;
    })
    .then(null, (err) => {
        console.log(err);
        return view;
    });
};

const checkLanguages = () => {
    let firstLang;
    if (typeof appConfig.languages !== 'object') {
        appConfig.languages = {
            en: 'default'
        };
    }
    for (let key in appConfig.languages) {
        (appConfig.languages[key]==='default') && (appConfig.defaultLanguage=key);
        if (appConfig.defaultLanguage) {
            break;
        }
        firstLang || (firstLang=key);
    }
    appConfig.defaultLanguage || (applyConfig.defaultLanguage=(firstLang || 'en'));
    return Promise.resolve();
};

const mergeModel = (request, context, config, view, affinityView) => {
    let prefix = cwd+'/versions/'+packageVersion+'/models/';
    const device = context.__device;

    const getModelFn = (level) => {
        let affinity, modelAffinity, modelFn;
        if (level===2) {
            affinity = '';
        }
        else if (level===1) {
            affinity = (device==='phone') ? '@tablet' : '';
        }
        else {
            affinity = (device==='desktop') ? '' : '@'+device;
        }
        modelAffinity = view+affinity;
        if (GLOBAL_MODELS[modelAffinity]!==undefined) {
            return Promise.resolve(GLOBAL_MODELS[modelAffinity]);
        }
        return new Promise((resolve) => {
            try {
                modelFn = require(prefix+modelAffinity+'.js');
                resolve(modelFn);
            }
            catch(err) {
                if (!err.message.startsWith('Cannot find module')) {
                    console.log(err);
                }
                GLOBAL_MODELS[modelAffinity]=false;
                resolve();
            }
        });
    };

    return getModelFn(0).then(modelFn => {
        if (!modelFn) {
            return getModelFn(1);
        }
        return modelFn;
    })
    .then(modelFn => {
        if (!modelFn) {
            return getModelFn(2);
        }
        return modelFn;
    })
    .then(modelFn => {
        let modelFnResult,
            affinity = (device==='desktop') ? '' : '@'+device;
        // model defined: then invoke the modelFn with `request` as `this`, merge the context and return
        if (modelFn) {
            GLOBAL_MODELS[view+affinity] = modelFn;
            modelFnResult = modelFn.call(request, config, request.language || appConfig.defaultLanguage);
            return Promise.resolve(modelFnResult).then(
                modelcontext => {
                    if (typeof modelcontext !== 'object') {
                        modelcontext = {model: modelcontext};
                    }
                    // very strange: it is like React doesn't support passing through this.props.content ??
                    // we need to remove this property, ptherwise the server would crash
                    if (modelcontext.content) {
                        console.warn('Model was created with a forbidden property "content" --> will remove the property');
                        delete modelcontext.content;
                    }
                    Object.assign(context, modelcontext);
                },
                err => {
                    console.warn(err);
                }
            );
        }
    })
    .then(() => {
         // we need to pass through the affinityView that came from the previous promise
        return affinityView;
    }, () => {
        return affinityView;
    });

};

const mergeAssets = (context, affinityView) => {
    let prefix = cwd+'/versions/'+packageVersion+'/assets/';
    const getPageCss = () => {
        let filename;
        if (GLOBAL_ASSETS.CSS[affinityView]!==undefined) {
            return Promise.resolve({
                link: GLOBAL_ASSETS.CSS[affinityView],
                inline: GLOBAL_ASSETS.INLINECSS[affinityView]
            });
        }
        // not yet looked up: search on the disk
        filename = prefix+'css/'+affinityView+'.css';
        return fsp.stat(filename).then(
            () => {
                GLOBAL_ASSETS.CSS[affinityView] = '/page/'+affinityView+'-'+packageVersion+'.css';
                appConfig.inlinecss && (GLOBAL_ASSETS.INLINECSS[affinityView]=fs.readFileSync(filename, 'utf8'));
                return {
                    link: GLOBAL_ASSETS.CSS[affinityView],
                    inline: GLOBAL_ASSETS.INLINECSS[affinityView]
                };
            },
            () => {
                GLOBAL_ASSETS.CSS[affinityView] = false;
                GLOBAL_ASSETS.INLINECSS[affinityView] = false;
                return {};
            }
        );
    };

    const getPageScript = () => {
        let filename;
        if (GLOBAL_ASSETS.JS[affinityView]!==undefined) {
            return Promise.resolve(GLOBAL_ASSETS.JS[affinityView]);
        }
        // not yet looked up: search on the disk
        filename = prefix+'js/viewapps/'+affinityView+'.js';
        return fsp.stat(filename).then(
            () => {
                GLOBAL_ASSETS.JS[affinityView] = '/'+affinityView+'-'+packageVersion+'.js';
                return GLOBAL_ASSETS.JS[affinityView];
            },
            () => {
                GLOBAL_ASSETS.JS[affinityView] = false;
            }
        );
    };

    const getCommonScript = () => {
        let filename;
        if (GLOBAL_ASSETS.COMMONJS!==undefined) {
            return Promise.resolve(GLOBAL_ASSETS.COMMONJS);
        }
        // not yet looked up: search on the disk
        filename = prefix+'js/common/main.js';
        return fsp.stat(filename).then(
            () => {
                GLOBAL_ASSETS.COMMONJS = '/common/main-'+packageVersion+'.js';
                return GLOBAL_ASSETS.COMMONJS;
            },
            () => GLOBAL_ASSETS.COMMONJS = false
        );
    };

    return Promise.all([
        getPageCss(),
        getPageScript(),
        getCommonScript()
    ]).then(response => {
        let assets = {
            __itsapagelinkcss: response[0].link,
            __itsapageinlinecss: response[0].inline,
            __itsapagescript: response[1],
            __itsacommonscript: response[2]
        };
        Object.assign(context, assets);
        return affinityView; // always return affinityView
    }).catch(() => {
        return affinityView; // always return affinityView
    });
};

const applyBuildStats = () => {
    return fsp.readJson(cwd+'/versions/'+packageVersion+'/build-stats.json').then(
        data => {
            data.forEach(record => {
                VIEW_COMPONENT_NRS[record.name] = {
                    componentId: record.componentId,
                    requireId: record.requireId
                };
            });
        }
    );
};

const initialize = (server, options, next) => {
    applyVersion()
    .then(applyConfig.bind(null, options))
    .then(applyBuildStats)
    .then(applyTitles)
    .then(applyClientRoutes)
    .then(initServer.bind(null, server, options))
    .then(setMiddleware.bind(null, server))
    .then(setRoutes.bind(null, server))
    .then(
        () => next(),
        err => {
            console.log(err);
            next();
        }
    );
};

const plugin = {
    register(server, options, next) {
        let inertPromise, visionPromise;

        inertPromise = server.plugins.inert ? Promise.resolve() : new Promise((resolve, reject) => {
            console.log('Hapijs-plugin Inert not found: going to register it');
            server.register({
                register: Inert
            }, err => {
                if (err) {
                    console.warn(err);
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });

        visionPromise = (server.root._replier._decorations && server.root._replier._decorations.view) ? Promise.resolve : new Promise((resolve, reject) => {
            console.log('Hapijs-plugin Vision not found: going to register it');
            server.register({
                register: Vision
            }, err => {
                if (err) {
                    console.warn(err);
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });

        Promise.all([
            inertPromise,
            visionPromise
        ])
        .then(
            () => initialize(server, options, next),
            () => initialize(server, options, next)
        );

    }
};

plugin.register.attributes = {
    pkg: require('../package.json')
};

module.exports = plugin;