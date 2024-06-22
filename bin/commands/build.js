import * as esbuild from 'esbuild';
import * as acorn from 'acorn'
import tsPlugin from 'acorn-typescript'
import AdmZip from 'adm-zip';
import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import escodegen from 'escodegen';

import {
    closeSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    writeFileSync
} from 'fs';

import {
    escapeRegExp,
    filepath,
    removeFilesRecursively,
    sleep,
    titleCase
} from '../../js/utils.js';

import {
    ACE_TYPES,
    ACE_DECORATORS,
    PARAM_DECORATOR,
    ALL_DECORATORS,
    TS_Types,
    aceDict,
    aceList,
} from '../../js/constants.js';

import { buildConfig as bc, loadBuildConfig, tsConfig } from '../../js/config.js';
import { addonJson, buildFile, resetParsedConfig } from '../../js/parser.js';
import { __, loadLanguage, resetLoadedLangs } from '../../js/lang.js';
import * as cli from '../../js/cli.js';
import chalk from 'chalk';
import { join, normalize } from 'path';

function emptyExport() {
    const exportPath = filepath(bc().exportPath);

    if (existsSync(exportPath)) {
        removeFilesRecursively(exportPath);
    }
}

function ensureFoldersExists() {
    emptyExport();

    const exportPath = bc().exportPath;

    mkdirSync(filepath(exportPath));
    mkdirSync(filepath(exportPath, "lang"));
    mkdirSync(filepath(exportPath, "c3runtime"));
}

function createEmptyFiles() {
    const emptyFiles = [
        "actions.js",
        "conditions.js",
        "expressions.js",
        "instance.js",
        "type.js",
    ];

    emptyFiles.forEach((file) => {
        closeSync(openSync(filepath(bc().exportPath, `c3runtime/${file}`), "w"));
    });
}

function getParserType(typeArg = '') {
    let type = typeArg;
    const isNode = typeof type === typeof {};

    if (isNode) {
        type = type.typeAnnotation?.type ??
            type.typeAnnotation?.typeName?.name.toLowerCase() ??
            type.type;

        if (type === 'TSTypeReference') {
            type = typeArg.typeAnnotation?.typeName?.name;
        }
    }


    if (!type) {
        return 'any';
    }

    return TS_Types[type] ?? (type.startsWith('TS') ? 'any' : type);
}

function getDecoratorParams(decoratorParams = {}) {
    return decoratorParams?.properties
        ?.reduce((obj, v) => {
            if (v.value.value) { // Literal/Scalar value
                obj[v.key.name] = v.value.value;
            } else { // Complex value
                try {
                    obj[v.key.name] = eval(escodegen.generate(v.value));
                } catch (error) {
                    throw Error(`ACE parameter '${v.key.name}' is not compilable. Use static values.`)
                }
            }
            return obj;
        }, {}) ?? {};
}

function getAceDecoratorConfig(decorator, decoratorParams = []) {
    switch (decorator) {
        case 'Action':
        case 'Condition':
            return getDecoratorParams(decoratorParams[1]);
        case 'Expression':
            return getDecoratorParams(decoratorParams[0]);
        case 'Trigger':
            const config = getDecoratorParams(decoratorParams[0]);
            config.displayText = config.displayText ?? "{my} {title}";

            if (config.isFakeTrigger) {
                config.isTrigger = false;
            } else {
                config.isTrigger = true;
            }
            // config.isFakeTrigger = !config.isTrigger;
            return config;
        default:
            throw Error("Trying to get configuration from an Unexpected Ace decorator");
    }
}

function formatParam(param = {}) {
    let id, initialValue, type;

    if (param.type === 'Identifier') {
        id = param.name;
        type = getParserType(param.typeAnnotation);
    } else if (param.type === 'AssignmentPattern') {
        id = param.left.name;
        type = getParserType(param.left.typeAnnotation);
        initialValue = param.right.value;
    } else {
        throw Error(`Unhandled ACE parameter assignation. Try using the '@${PARAM_DECORATOR}' decorator or typings.`);
    }

    let config = (param.decorators ?? [])?.filter((v) => v.expression.callee?.name === PARAM_DECORATOR);

    if (config.length > 1) {
        throw Error(`Decorator '@${PARAM_DECORATOR}' must be declared once per parameter`);
    }

    config = getDecoratorParams(config[0]?.expression?.arguments[0]);

    return {
        ...config,
        id: config.id ?? id,
        name: config.name ?? titleCase(id),
        desc: config.desc ?? '',
        type: config.type ?? type ?? 'any',
        ...(initialValue ? { initialValue } : {})
    }
}

/**
 * @param {import('../../types/config.js').BuildConfig} config 
 * @param {import('../../types/config.js').BuiltAddonConfig} addon 
 */
async function addonFromConfig(config, addon) {
    return {
        "is-c3-addon": true,
        "sdk-version": 2,
        type: addon.addonType,
        name: addon.name,
        id: addon.id,
        version: addon.version,
        author: addon.author,
        website: addon.website,
        documentation: addon.documentation,
        description: addon.description,
        "editor-scripts": addon?.editorScripts ?? [],
        "file-list": [
            "c3runtime/actions.js",
            "c3runtime/conditions.js",
            "c3runtime/expressions.js",
            "c3runtime/instance.js",
            `c3runtime/${addon.addonType}.js`,
            "c3runtime/type.js",
            "lang/en-US.json",
            "aces.json",
            "addon.json",
            addon.icon ? addon.icon : "icon.svg",
            "editor.js",
            ...Object.keys(addon.fileDependencies),
        ],
    };
}

function langFromConfig(config, addon, aces) {
    const jsonRegex = new RegExp("\\.json$");
    const langPath = filepath(config.langPath);
    let fileLangs = [];

    if (existsSync(langPath)) {
        fileLangs = readdirSync(langPath)
            .filter((v) => v.match(jsonRegex))
            .map((v) => v.replace(jsonRegex, ''));
    }

    const langs = [...new Set([
        config.defaultLang,
        ...fileLangs
    ])];

    let configs = {};

    langs.forEach((languageTag) => {
        loadLanguage(languageTag);
        let id = addon.id.toLowerCase();

        const lang = {
            languageTag,
            fileDescription: `Language ${languageTag} translation file for ${addon.name}.`,
            text: {},
        }

        let root;
        if (addon.addonType === "plugin") {
            lang.text.plugins = {};
            lang.text.plugins[id] = {};
            root = lang.text.plugins[id];
        } else if (addon.addonType === "behavior") {
            lang.text.behaviors = {};
            lang.text.behaviors[id] = {};
            root = lang.text.behaviors[id];
        } else if (addon.addonType === "effect") {
            lang.text.effects = {};
            lang.text.effects[id] = {};
            root = lang.text.effects[id];
        } else {
            throw new Error("Invalid addon type");
        }
        root.name = __(addon.name);
        root.description = __(addon.description);
        root["help-url"] = __(addon.documentation);

        root.aceCategories = {};
        for (const key in addon.aceCategories) {
            root.aceCategories[key] = __(addon.aceCategories[key]);
        }

        root.properties = {};
        addon.properties.forEach((property) => {
            root.properties[property.id] = {
                name: __(property.name),
                desc: __(property.desc),
            };
            if (property.type === "combo") {
                root.properties[property.id].items = {};
                property.options.items.forEach((item) => {
                    const key = Object.keys(item)[0];
                    root.properties[property.id].items[key] = __(item[key]);
                });
            } else if (property.type === "link") {
                root.properties[property.id]["link-text"] = __(property.linkText);
            }
        });

        const ungroupedAces = aceList();

        Object.keys(aces)
            .reduce((dict, k) => {
                for (const type in dict) {
                    dict[type] = [...dict[type], ...aces[k][type]];
                }
            }, ungroupedAces);

        root.actions = {};
        Object.keys(ungroupedAces.actions).forEach((key) => {
            const action = ungroupedAces.actions[key];
            root.actions[action.id] = {
                "list-name": __(action.listName),
                "display-text": __(action.displayText),
                description: __(action.description),
                params: {},
            };
            action.params = action.params || [];
            action.params.forEach((param) => {
                root.actions[action.id].params[param.id] = {
                    name: __(param.name),
                    desc: __(param.desc),
                };

                if (param.type === "combo") {
                    root.actions[action.id].params[param.id].items = {};
                    param.items.forEach((item) => {
                        const itemkey = Object.keys(item)[0];
                        root.actions[key].params[param.id].items[itemkey] = __(item[itemkey]);
                    });
                }
            });
        });

        root.conditions = {};
        Object.keys(ungroupedAces.conditions).forEach((key) => {
            const condition = ungroupedAces.conditions[key];
            root.conditions[condition.id] = {
                "list-name": __(condition.listName),
                "display-text": __(condition.displayText),
                description: __(condition.description),
                params: {},
            };
            condition.params = condition.params || [];
            condition.params.forEach((param) => {
                root.conditions[condition.id].params[param.id] = {
                    name: __(param.name),
                    desc: __(param.desc),
                };
                if (param.type === "combo") {
                    root.conditions[condition.id].params[param.id].items = {};
                    (param.items ?? []).forEach((item) => {
                        const itemkey = Object.keys(item)[0];
                        root.conditions[condition.id].params[param.id].items[itemkey] = __(item[itemkey]);
                    });
                }
            });
        });

        root.expressions = {};
        Object.keys(ungroupedAces.expressions).forEach((key) => {
            const expression = ungroupedAces.expressions[key];
            root.expressions[expression.id] = {
                "translated-name": __(expression.listName),
                description: __(expression.description),
                params: {},
            };

            expression.params = expression.params || [];
            expression.params.forEach((param) => {
                root.expressions[expression.id].params[param.id] = {
                    name: __(param.name),
                    desc: __(param.desc),
                };
                if (param.type === "combo") {
                    root.expressions[expression.id].params[param.id].items = {};
                    param.items.forEach((item) => {
                        const itemkey = Object.keys(item)[0];
                        root.expressions[expression.id].params[param.id].items[itemkey] = __(item[itemkey]);
                    });
                }
            });
        });

        configs[languageTag] = lang;
    }, {});

    return configs;
}

function acesFromConfig(config) {
    const aces = {};

    Object.keys(config).forEach((category) => {
        aces[category] = {
            conditions: config[category].conditions
                .map((ace) => {
                    const ret = {
                        id: ace.id,
                        scriptName: ace.id,
                    };
                    Object.keys(ace).forEach((key) => {
                        switch (key) {
                            case "category":
                            case "forward":
                            case "handler":
                            case "listName":
                            case "displayText":
                            case "description":
                            case "params":
                                break;
                            default:
                                ret[key] = ace[key];
                        }
                    });
                    if (ace.params) {
                        ret.params = ace.params.map((param) => {
                            const ret = {};
                            Object.keys(param).forEach((key) => {
                                switch (key) {
                                    case "name":
                                    case "desc":
                                    case "items":
                                        break;
                                    default:
                                        ret[key] = param[key];
                                }
                            });
                            if (param.items) {
                                ret.items = param.items.map((item) => Object.keys(item)[0]);
                            }

                            return ret;
                        });
                    }
                    return ret;
                }),
            actions: config[category].actions
                .map((ace) => {
                    const ret = {
                        id: ace.id,
                        scriptName: ace.id,
                    };
                    Object.keys(ace).forEach((key) => {
                        switch (key) {
                            case "category":
                            case "forward":
                            case "handler":
                            case "listName":
                            case "displayText":
                            case "description":
                            case "params":
                                break;
                            default:
                                ret[key] = ace[key];
                        }
                    });
                    if (ace.params) {
                        ret.params = ace.params.map((param) => {
                            const ret = {};
                            Object.keys(param).forEach((key) => {
                                switch (key) {
                                    case "name":
                                    case "desc":
                                    case "items":
                                        break;
                                    default:
                                        ret[key] = param[key];
                                }
                            });
                            if (param.items) {
                                ret.items = param.items.map((item) => Object.keys(item)[0]);
                            }

                            return ret;
                        });
                    }
                    return ret;
                }),
            expressions: config[category].expressions
                .map((ace) => {
                    const ret = {
                        id: ace.id,
                        scriptName: ace.id,
                        expressionName: ace.id,
                    };
                    Object.keys(ace).forEach((key) => {
                        switch (key) {
                            case "category":
                            case "forward":
                            case "handler":
                            case "listName":
                            case "displayText":
                            case "description":
                            case "params":
                                break;
                            default:
                                ret[key] = ace[key];
                        }
                    });
                    if (ace.params) {
                        ret.params = ace.params.map((param) => {
                            const ret = {};
                            Object.keys(param).forEach((key) => {
                                switch (key) {
                                    case "name":
                                    case "desc":
                                    case "items":
                                        break;
                                    default:
                                        ret[key] = param[key];
                                }
                            });
                            if (param.items) {
                                ret.items = param.items.map((item) => Object.keys(item)[0]);
                            }

                            return ret;
                        });
                    }
                    return ret;
                }),
        };
    });

    return aces;
}

/**
 * @param {import('../../types/config.js').BuildConfig} config 
 * @param {import('../../types/config.js').BuiltAddonConfig} addon
 */
function distribute(config, addon) {
    // zip the content of the export folder and name it with the plugin id and version and use .c3addon as extension
    const zip = new AdmZip();
    zip.addLocalFolder(filepath(config.exportPath, "c3runtime"), "c3runtime");
    zip.addLocalFolder(filepath(config.exportPath, "lang"), "lang");

    // for each remaining file in the root export folder
    readdirSync(filepath(config.exportPath)).forEach((file) => {
        // if the file is not the c3runtime or lang folder
        if (file !== "c3runtime" && file !== "lang") {
            // add it to the zip
            zip.addLocalFile(filepath(config.exportPath, file), "");
        }
    });

    const distPath = filepath(config.distPath);

    // if dist folder does not exist, create it
    if (!existsSync(distPath)) {
        mkdirSync(distPath);
    }

    zip.writeZip(filepath(config.distPath, `${addon.id}-${addon.version}.c3addon`));
}

// Collection of ACEs by group for aces.json
let aces = {};
// Collection of ACEs to call on runtime
export let acesRuntime = aceDict();

function hasDecorators(ts = '') {
    const pattern = "@(" + ALL_DECORATORS.join('|') + ")";
    const regex = new RegExp(pattern, 'ig');
    const match = ts.match(regex);

    if (!match) {
        return;
    }

    // Detect comments
    const decorator = ts.match(regex)[0];
    const endAt = ts.indexOf(decorator);
    const startAt = ts.slice(0, endAt).lastIndexOf('\n');
    const lineBefore = ts.slice(startAt, endAt);

    return !lineBefore.match(/(\/\*|\/\/)/);
}

/**
 * @param {import('acorn').Program} tree 
 */
function searchTopClasses(tree) {
    return tree.body.filter(node => node.type === 'ClassDeclaration');
}

/**
 * @returns {esbuild.OnLoadResult|null|undefined} 
 */
function parseScript(ts) {
    let offset = 0;
    const tree = acorn.Parser.extend(tsPlugin()).parse(ts, {
        ecmaVersion: '2022',
        sourceType: 'module',
        // TODO: Allow description via docblock
        // onComment: (isBlock, text, s, e, loc, endLoc) => {
        //   console.log(loc, endLoc);
        // }
    });

    const removeDecorator = (decorator) => {
        ts = ts.slice(0, decorator.start - offset) + ts.slice(decorator.end - offset)
        offset += decorator.end - decorator.start;
    }

    /** @type {import('acorn').ClassDeclaration[]} */
    const classes = searchTopClasses(tree);

    // Probably this could be abstracted to its own function
    classes.forEach(classDeclaration => {
        const aceClass = classDeclaration?.decorators?.find((v) => v.expression?.callee?.name === 'AceClass');

        if (!aceClass) {
            return;
        }

        removeDecorator(aceClass);

        /** @type {import('acorn').Node[]} */
        const classFeatures = classDeclaration.body.body;
        const methodAces = classFeatures.filter(v => v.type == 'MethodDefinition' && v.decorators?.length && Object.keys(ACE_DECORATORS).includes(v.decorators[0]?.expression.callee?.name));

        methodAces.forEach(v => {
            const id = v.key.name;
            const title = titleCase(id);

            if (v.decorators.length > 1) {
                throw Error(`Method '${id}' can only be one ACE`);
            }

            const decorator = v.decorators[0];

            const decoratorName = decorator.expression.callee.name;
            const aceType = ACE_DECORATORS[decoratorName];
            // ACE_TYPES[decorator.expression.callee.name];

            if (!aceType) {
                throw Error(`Unkown ACE operation on '${id}'`);
            }

            removeDecorator(decorator);

            const decoratorParams = decorator.expression.arguments;

            if (decoratorParams?.length > 1) {
                if (decoratorParams.length > 2 || decoratorParams[1].type !== 'ObjectExpression') {
                    throw Error(`You must pass an object as option argument on '${id}' ACE`);
                }
            }

            const config = getAceDecoratorConfig(decoratorName, decoratorParams);

            let returnType = config?.returnType;

            const method = v.value;

            if (!returnType && method.returnType) {
                returnType = getParserType(method.returnType);
            }

            if (!returnType && aceType === 'expressions') {
                returnType = 'any';
            }

            const category = config.category ?? 'general';

            const params = method.params?.map((v) => {
                if (v.decorators) {
                    v.decorators.forEach(v => removeDecorator(v));
                }
                return formatParam(v);
            }) ?? [];

            let displayText = config.displayText;

            if (!displayText) {
                // Auto-assign params to display text
                if (params.length) {
                    displayText = title + " (" + Object.keys(params).map(v => `{${v}}`).join(', ') + ")";
                } else {
                    displayText = title;
                }
            }

            if (!aces[category]) {
                aces[category] = {};
                for (const type in ACE_TYPES) {
                    aces[category][type] = [];
                }
            }

            acesRuntime[aceType][id] = `(inst) => inst.${id}`;
            aces[category][aceType].push({
                ...config,
                id,
                displayText: displayText.replace("{title}", title),
                listName: config.listName ?? title,
                category,
                params,
                description: config.description ?? '',
                ...(returnType ? { returnType } : {}),
            });
        });
    });

    return {
        contents: esbuild.transformSync(ts, {
            loader: 'ts',
            tsconfigRaw: tsConfig(),
        }).code
    }
}

/**
 * @param {BuildConfig} config  
 * @returns {import('esbuild').Plugin} 
 */
function parseAces(config) {
    const parseFile = new RegExp(escapeRegExp(config.sourcePath) + ".*\\.ts$");

    return {
        name: 'c3framework-aces',
        setup(build) {
            build.onLoad({ filter: /.*\.ts$/ }, (args) => {
                const normalized = normalize(args.path).replace(/\\/g, '/'); // I hate you Bill Gates...

                if (!normalized.match(parseFile)) {
                    return;
                }

                let ts = readFileSync(normalized).toString('utf-8');

                if (!hasDecorators(ts)) {
                    return;
                }

                let parsed;

                try {
                    parsed = parseScript(ts)
                } catch (error) {
                    const relativePath = join(config.sourcePath, normalized.replace(filepath(config.sourcePath), ''));
                    throw Error('Script ' + chalk.bold(relativePath) + ' ' + error)
                }

                return parsed;
            });

        }
    };
}

// TODO: Abstract everything from the parser to its own parser module
async function build() {
    const config = await loadBuildConfig();

    ensureFoldersExists();
    createEmptyFiles();

    const main = await buildFile(filepath(config.sourcePath, config.runtimeScript), config, [parseAces(config)]);

    if (!addonJson) {
        throw Error(`Addon wasn't parsed properly. This may be due of not being able to find '${config.addonScript}'`);
    }

    writeFileSync(filepath(config.exportPath, `c3runtime/${addonJson.addonType}.js`), main);
    writeFileSync(filepath(config.exportPath, "aces.json"), JSON.stringify(acesFromConfig(aces), null, 2));

    const langs = langFromConfig(config, addonJson, aces);

    for (const lang in langs) {
        const langFile = langs[lang];
        writeFileSync(filepath(config.exportPath, "lang/", lang + ".json"), JSON.stringify(langFile, null, 2));
    }

    writeFileSync(filepath(config.exportPath, "addon.json"), JSON.stringify(await addonFromConfig(config, addonJson), null, 2));

    await Promise.all(
        addonJson.editorScripts.map(async (v) => {
            if (!v.match(/\.(js|ts)$/)) {
                throw Error(`Editor script path '${v}' is neither a JavaScript nor TypeScript path`);
            }

            const tsPath = v.trim().replace(/\.js$/, '.ts');
            const jsPath = v.trim().replace(/\.ts$/, '.js');

            const path = filepath(config.sourcePath, tsPath);
            const outpath = filepath(config.exportPath, jsPath);

            return await buildFile(path, config).then((editor) => {
                return writeFileSync(outpath, editor, { encoding: 'utf-8' });
            });
        })
    );

    if (addonJson.icon) {
        copyFileSync(filepath(config.sourcePath, addonJson.icon), filepath(config.exportPath, addonJson.icon));
    } else {
        copyFileSync(filepath(config.sourcePath, "icon.svg"), filepath(config.exportPath, "icon.svg"));
    }
}

async function runServer(callback = async () => { }, {
    port = null,
    host = null,
} = {}) {
    const config = await loadBuildConfig();

    port = port ?? config.port;

    host = host ?? config.host;

    const path = () => `${host}:${port}/addon.json`;

    await callback();

    const watchDirectories = [...new Set([
        config.sourcePath,
        config.langPath,
        config.defPath,
        config.libPath,
    ])];

    const watcher = chokidar.watch(watchDirectories, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
    });

    function message() {
        cli.clear();
        cli.log(
            cli.center(`Server is running at ${host}:${port}`),
            '',
            cli.center('Import addon.json path:'),
            cli.center(path(), chalk.blueBright.underline)
        );
    }

    watcher.on("change", async (path) => {
        console.log(`* Changed '${path}', rebuilding...`);
        await callback()
            .then(() => setTimeout(() => message(), 200))
            .catch(e => console.error(e));
        resetLoadedLangs();
    });

    // Create an express application
    const app = express();

    // Enable all CORS requests
    app.use(cors());

    // Serve static files from the 'export' directory
    app.use(express.static(config.exportPath));

    // Start the server
    function tryListen() {
        app.listen(port, () => {
            message();
        });
    }

    process.on("uncaughtException", function (err) {
        cli.clear();
        if (err.code === "EADDRINUSE") {
            cli.log(cli.center(`Port ${port} is already in use. Trying another port...`, chalk.italic))
            port++;
            sleep(500).then(() => tryListen());
        } else {
            emptyExport();
            cli.error(err.stack);
            process.exit(1);
        }
    });

    tryListen();
}

export default async function (devBuild = false, serverOpts = {}, {
    dist = true
} = {}) {
    if (devBuild) {
        runServer(async () => {
            aces = {};
            acesRuntime = aceDict();
            resetParsedConfig();

            build();
        }, serverOpts);
        return;
    }

    cli.clear();
    cli.log();
    cli.loading('Building for production...');

    await build().then(() => {
        if (dist) {
            distribute(bc(), addonJson);
            cli.loading('Packaging...');
        } else {
            cli.loading('Skipping packaging...');
        }
    });

    cli.line('Building complete!', chalk.blueBright.bold);
}