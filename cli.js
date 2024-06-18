#! /usr/bin/env node

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import * as acorn from 'acorn'
import tsPlugin from 'acorn-typescript'
import AdmZip from 'adm-zip';
import express from 'express';
import cors from 'cors';
import chokidar from 'chokidar';
import escodegen from 'escodegen';
import { getByPath } from 'dot-path-value';
import { cwd } from 'process';

const args = process.argv.slice(2);
const devBuild = args.includes("--dev");
const tsConfig = fs.readFileSync(filepath('./tsconfig.json')).toString('utf8');


function trimPathSlashes(str = '') {
    return str.trim().replace(/^\.?(\/|\\)|(\\|\/)$/g, '');
}

function filepath(...paths) {
    paths = path.join(...paths.map(v => trimPathSlashes(v)));
    return path.join(cwd(), paths);
}

function fileExtension(filename = '') {
    return filename.trim().match(/(?:\.([^.]+))?$/)[1]?.toLowerCase() ?? null;
}

function writeFileRecursively(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}


function removeFilesRecursively(dir) {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(function (file) {
            var curPath = path.join(dir, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // recurse
                removeFilesRecursively(curPath);
            } else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dir);
    }
}

function emptyFolder() {
    const exportPath = filepath(_buildConfig.exportPath);

    if (fs.existsSync(exportPath)) {
        removeFilesRecursively(exportPath);
    }
}

function ensureFoldersExists() {
    emptyFolder();

    fs.mkdirSync(filepath(_buildConfig.exportPath));
    fs.mkdirSync(filepath(_buildConfig.exportPath, "lang"));
    fs.mkdirSync(filepath(_buildConfig.exportPath, "c3runtime"));
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
        fs.closeSync(fs.openSync(filepath(_buildConfig.exportPath, `c3runtime/${file}`), "w"));
    });
}

function titleCase(str) {
    return str.replace(/(?<=\w)([A-Z])/g, ' $1').replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}


const ACE_TYPES = {
    actions: 'Acts',
    conditions: 'Cnds',
    expressions: 'Exps',
};

const ACE_DECORATORS = {
    Action: 'actions',
    Condition: 'conditions',
    Trigger: 'conditions',
    Expression: 'expressions',
};

const PARAM_DECORATOR = 'Param';

const ALL_DECORATORS = [
    'AceClass',
    ...Object.keys(ACE_DECORATORS),
    PARAM_DECORATOR,
];

const TS_Types = {
    'TSStringKeyword': 'string',
    'TSNumberKeyword': 'number',
    'TSAnyAnnotation': 'any',
};

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

function aceDict() {
    return Object.keys(ACE_TYPES).reduce((obj, k) => {
        obj[k] = {};
        return obj;
    }, {});
}

function aceList() {
    return Object.keys(ACE_TYPES).reduce((obj, k) => {
        obj[k] = [];
        return obj;
    }, {});
}

const DEFAULT_IMPORT_TYPE = 'external-dom-script';

function getImportTypeByExtension(ext) {
    switch (ext) {
        case 'css':
            return 'external-css';

        default:
            return DEFAULT_IMPORT_TYPE;
    }
}

async function processDependencyFile(config, filename, ext, type) {
    const input = filepath(config.libPath, filename);
    let output = filepath(_buildConfig.exportPath, 'c3runtime/libs', filename);
    output = output.replace(/\.ts$/, '.js');

    if (ext === 'ts') {
        writeFileRecursively(output, await parseFile(input, config));
        return output;
    }

    writeFileRecursively(output, fs.readFileSync(input));
    return output;
}

/**
 * @param {import('./index.js').BuildConfig} config 
 */
function getTypeDefinitions(config) {
    const definitions = fs.readdirSync(filepath(config.defPath))
        .filter((v => v.endsWith('.d.ts')))
        .map((filename) => {
            const defPath = config.defPath;
            const exportPath = config.exportPath;

            const input = filepath(defPath, '/', filename);
            const output = input.replace(filepath(defPath), filepath(exportPath, 'c3runtime/'))

            writeFileRecursively(output, fs.readFileSync(input));

            return trimPathSlashes(output.replace(filepath(exportPath), ''));
        });

    return definitions;
}

/**
 * @param {import('./index.js').BuildConfig} config 
 * @param {import('./index.js').BuiltAddonConfig} addon 
 */
async function getFileListFromConfig(config, addon) {
    const exportPath = filepath(config.exportPath);
    const libPath = filepath(config.libPath);
    const copyConfig = addon.fileDependencies;

    const files = await fs.readdirSync(libPath).reduce(async (objP, filename) => {
        const obj = await objP;
        const ext = fileExtension(filename);
        let importType;

        if (copyConfig[filename]) {
            importType = copyConfig[filename];
            delete copyConfig[filename];
        } else {
            importType = getImportTypeByExtension(ext);
        }

        let output = await processDependencyFile(
            config,
            filename,
            ext,
            importType
        );

        if (path.isAbsolute(output)) {
            output = trimPathSlashes(output.replace(exportPath, ''));
        }

        obj[output] = importType;
        return obj;
    }, Promise.resolve({}));

    // There's a mismatch betwwen the files from libs and 
    // the files on the config... 
    // TODO: Check if these are remote files
    const leftFiles = Object.keys(copyConfig);
    if (leftFiles.length) {
        console.warn(`Following dependency files were not found: ${leftFiles.join(', ')}`);
    }

    return files;
}

/**
 * @param {import('./index.js').BuildConfig} config 
 * @param {import('./index.js').BuiltAddonConfig} addon 
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
            "c3runtime/behavior.js",
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

let _activeLang;
let _langLoaded = {};
function loadLanguage(lang) {
    const path = filepath(_buildConfig.langPath, lang + ".json");
    _activeLang = lang;

    if (_langLoaded[lang]) {
        return _langLoaded[lang];
    }

    if (!fs.existsSync(path)) {
        return _langLoaded[lang] = {};
    }

    return _langLoaded[lang] = JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
}

function __(key) {
    return getByPath(_langLoaded[_activeLang] ?? _langLoaded[_buildConfig.defaultLang] ?? {}, key) ?? key;;
}

function langFromConfig(config, addon, aces) {
    const jsonRegex = new RegExp("\\.json$");
    const fileLangs = fs.readdirSync(filepath(config.langPath))
        .filter((v) => v.match(jsonRegex))
        .map((v) => v.replace(jsonRegex, ''));

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
                "translated-name": __(key),
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
                        id: key,
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
 * @param {import('./types/config.js').BuildConfig} config 
 * @param {import('./types/config.js').BuiltAddonConfig} addon
 */
function distribute(config, addon) {
    // zip the content of the export folder and name it with the plugin id and version and use .c3addon as extension
    const zip = new AdmZip();
    zip.addLocalFolder(filepath(config.exportPath, "c3runtime"), "c3runtime");
    zip.addLocalFolder(filepath(config.exportPath, "lang"), "lang");

    // for each remaining file in the root export folder
    fs.readdirSync(filepath(config.exportPath)).forEach((file) => {
        // if the file is not the c3runtime or lang folder
        if (file !== "c3runtime" && file !== "lang") {
            // add it to the zip
            zip.addLocalFile(filepath(config.exportPath, file), "");
        }
    });

    const distPath = filepath(config.distPath);

    // if dist folder does not exist, create it
    if (!fs.existsSync(distPath)) {
        fs.mkdirSync(distPath);
    }

    zip.writeZip(filepath(config.distPath, `${addon.id}-${addon.version}.c3addon`));
}

export async function readAddonConfig(tsAddonConfig = '', { loader = 'ts' } = {}) {
    const getConfig = new Function(
        esbuild.transformSync(tsAddonConfig, {
            format: 'iife',
            globalName: 'config',
            loader
        }).code + ' return config;'
    );
    /** @type {import('./index.js').BuiltAddonConfig} */
    let config;

    try {
        config = getConfig().default;
    } catch (error) {
        throw Error("Error on reading Addon Config. Please be sure to not execute external libraries from there." + "\n" + error);
    }

    // * Remove ACEs
    for (const key in ACE_TYPES) {
        delete config[key];
    }

    // * Dependencies files
    const dependencies = await getFileListFromConfig(_buildConfig, config);
    config.fileDependencies = dependencies;

    // * Type definitions
    const typeDefs = getTypeDefinitions(_buildConfig);

    config.typeDefs = typeDefs;

    return config;
}

// Collection of ACEs by group for aces.json
let aces = {};
// Collection of ACEs to call on runtime
let acesRuntime = aceDict();

/** @type {import('./index.js').BuiltAddonConfig} */
let addonJson;

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
        ecmaVersion: '2021',
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

            const aceType = ACE_DECORATORS[decorator.expression.callee.name];
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

            const config = getDecoratorParams(decoratorParams[1]);

            let returnType = config?.returnType;

            const method = v.value;

            if (!returnType && method.returnType) {
                returnType = getParserType(method.returnType);
            }

            const category = config.category ?? 'general';

            const params = method.params?.map((v) => {
                if (v.decorators) {
                    v.decorators.forEach(v => removeDecorator(v));
                }
                return formatParam(v);
            }) ?? [];

            let displayText = decoratorParams[0]?.value;

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
                displayText,
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
            tsconfigRaw: tsConfig,
        }).code
    }
}

/**
 * @param {import('./index.js').BuildConfig} config  
 * @returns {import('esbuild').Plugin} 
 */
function parseAddonConfig(config) {
    const addonScript = new RegExp(filepath(config.sourcePath, config.addonScript));

    return {
        name: 'c3framework-config',
        setup(build) {
            build.onLoad({ filter: addonScript }, async (config) => {
                if (addonJson) {
                    return {
                        contents: "export default " + JSON.stringify(addonJson, null, 4)
                    }
                }

                const content = fs.readFileSync(config.path).toString('utf-8');
                const inject = JSON.stringify(acesRuntime, null, 4).replace(/"(\(inst\) => inst\.[a-zA-Z0-9$_]+)"/, '$1');
                const injected = content.replace(/(export\s+default\s+)([^;]+);/, `$1{\n...($2), \n...({Aces: ${inject}})\n};`);
                const jsConfig = esbuild.transformSync(injected, {
                    loader: 'ts',
                    tsconfigRaw: tsConfig,
                }).code;

                try {
                    addonJson = await readAddonConfig(jsConfig, { loader: 'js' });
                } catch (error) {
                    throw Error("Error on `addonConfig.ts`. Please be sure to not execute external libraries from there." + "\n" + error);
                }

                return {
                    contents: jsConfig
                };
            });
        }
    }
}

/**
 * @param {import('./index.js').BuildConfig} config  
 * @returns {import('esbuild').Plugin} 
 */
function parseAces(config) {
    const parseFile = new RegExp("^" + filepath(config.sourcePath) + "(\\/|\\\\)\[^\\/\\\\]+\\.ts");

    return {
        name: 'c3framework-aces',
        setup(build) {
            build.onLoad({ filter: parseFile }, (args) => {
                let ts = fs.readFileSync(args.path).toString('utf-8');

                // match decorators
                if (!hasDecorators(ts)) {
                    return;
                }

                return parseScript(ts);
            });

        }
    };
}

/** @type {import('./types/config.js').BuildConfig} */
let _buildConfig;

/** @returns {Promise<import('./index.js').BuildConfig | {}>} */
async function loadBuildConfig() {
    if (_buildConfig) {
        return _buildConfig;
    }

    const defaultConfig = {
        minify: true,
        host: 'http://localhost',
        port: 3000,
        defaultLang: 'en-US',
        sourcePath: 'src/',
        langPath: 'src/lang',
        libPath: 'src/libs',
        addonScript: 'addon.ts',
        runtimeScript: 'runtime.ts',
        defPath: 'src/',
        exportPath: 'export/',
        examplesPath: 'examples/',
        distPath: 'dist/',
    };

    const configPath = filepath('./c3.config.js');
    if (fs.existsSync(configPath)) {
        const loadedConfig = await import(configPath).then(v => v.default);
        _buildConfig = { ...defaultConfig, ...loadedConfig };
        return _buildConfig;
    }

    return _buildConfig = defaultConfig;
}

async function parseFile(file = '', config = {}, plugins = []) {
    return await esbuild.build({
        entryPoints: [file],
        bundle: true,
        allowOverwrite: true,
        plugins: [
            parseAddonConfig(config),
            ...plugins,
        ],
        write: false,
        tsconfigRaw: tsConfig,
        minify: config?.minify ?? true,
    }).then(v => v.outputFiles[0].text);
}

async function build() {
    const config = await loadBuildConfig();

    ensureFoldersExists();
    createEmptyFiles();

    const main = await parseFile(filepath(config.sourcePath, config.runtimeScript), config, [parseAces(config)]);

    fs.writeFileSync(filepath(config.exportPath, "c3runtime/behavior.js"), main);
    fs.writeFileSync(filepath(config.exportPath, "aces.json"), JSON.stringify(acesFromConfig(aces), null, 2));

    const langs = langFromConfig(config, addonJson, aces);

    for (const lang in langs) {
        const langFile = langs[lang];
        fs.writeFileSync(filepath(config.exportPath, "lang/", lang + ".json"), JSON.stringify(langFile, null, 2));
    }

    fs.writeFileSync(filepath(config.exportPath, "addon.json"), JSON.stringify(await addonFromConfig(config, addonJson), null, 2));

    await Promise.all(
        addonJson.editorScripts.map(async (v) => {
            if (!v.match(/\.(js|ts)$/)) {
                throw Error(`Editor script path '${v}' is neither a JavaScript nor TypeScript path`);
            }

            const tsPath = v.trim().replace(/\.js$/, '.ts');
            const jsPath = v.trim().replace(/\.ts$/, '.js');

            const path = filepath(config.sourcePath, tsPath);
            const outpath = filepath(config.exportPath, jsPath);

            return await parseFile(path, config).then((editor) => {
                return fs.writeFileSync(outpath, editor, { encoding: 'utf-8' });
            });
        })
    );

    if (addonJson.icon) {
        fs.copyFileSync(filepath(config.sourcePath, addonJson.icon), filepath(config.exportPath, addonJson.icon));
    } else {
        fs.copyFileSync(filepath(config.sourcePath, "icon.svg"), filepath(config.exportPath, "icon.svg"));
    }

}

let port = 3000;

async function runServer(callback = async () => { }) {
    const config = await loadBuildConfig();

    port = config.port;

    const host = config.host;

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
        process.stdout.write('\x1Bc');
        console.log(`|===| Alfred Butler |===|

Server is running at ${host}:${port}

Import addon.json path:
${path()}
`);
    }

    watcher.on("change", async (path) => {
        console.log(`* Changed '${path}', rebuilding...`);
        await callback()
            .then(() => setTimeout(() => message(), 200))
            .catch(e => console.error(e));
        _langLoaded = {};
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
        if (err.code === "EADDRINUSE") {
            console.log(`Port ${port} is already in use. Trying another port...`);
            port++;
            tryListen();
        } else {
            emptyFolder();
            console.log(err);
            process.exit(1);
        }
    });

    tryListen();
}

if (devBuild) {
    runServer(async () => {
        aces = {};
        acesRuntime = aceDict();
        addonJson = undefined;

        build();
    });
} else {
    await build().then(() => {
        distribute(_buildConfig, addonJson);
    });
}