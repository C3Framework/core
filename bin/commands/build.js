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
    endsWithDot,
    escapeRegExp,
    filepath,
    lowerFirst,
    removeFilesRecursively,
    sleep,
    titleCase,
    wordWrap
} from '../lib/utils.js';

import {
    ACE_TYPES,
    ACE_DECORATORS,
    PARAM_DECORATOR,
    ALL_DECORATORS,
    TS_Types,
    aceDict,
    aceList,
} from '../lib/constants.js';

import { buildConfig as bc, loadBuildConfig, tsConfig } from '../lib/config.js';
import { addonJson, buildFile, partialAddonJson, readAddonConfig, resetParsedConfig, setPartialAddonJson } from '../lib/parser.js';
import { __, loadLanguage, resetLoadedLangs } from '../lib/lang.js';
import * as cli from '../lib/cli.js';
import chalk from 'chalk';
import { dirname, join, normalize } from 'path';
import { buildTheme } from './theme.js';
import { md5 } from 'super-fast-md5';

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

        if (type === 'Promise') {
            type = (typeArg.typeAnnotation.typeParameters.params ?? [])[0]?.type ?? 'TSAnyKeyword';
        }

    }


    if (!type) {
        return 'any';
    }

    return TS_Types[type] ?? (type.startsWith('TS') ? 'any' : type);
}

function astToValue(ast) {
    let value;

    try {
        value = eval(escodegen.generate(ast));
    } catch (error) {
        throw new Error(`Couldn\'t obtain value from AST`)
    }

    return value;
}

function getDecoratorParams(decoratorParams = {}) {
    return decoratorParams?.properties
        ?.reduce((obj, v) => {
            if (v.value.value) { // Literal/Scalar value
                obj[v.key.name] = v.value.value;
            } else { // Complex value
                try {
                    obj[v.key.name] = astToValue(v.value);
                } catch (error) {
                    throw new Error(`ACE parameter '${v.key.name}' is not compilable. Use static values.`)
                }
            }
            return obj;
        }, {}) ?? {};
}

function getAceDecoratorConfig(decorator, decoratorParams = []) {
    const [nameOrObjectParam, objectParam] = decoratorParams;

    switch (decorator) {
        case 'Action':
        case 'Condition':
            let params = {};

            if (nameOrObjectParam?.type === 'ObjectExpression') {
                params = getDecoratorParams(nameOrObjectParam)
            } else {
                params = getDecoratorParams(objectParam)

                if (params.displayText === undefined) {
                    try {
                        params.displayText = astToValue(nameOrObjectParam) ?? undefined;
                    } catch (error) { }
                }
            }


            return params;
        case 'Expression':
            return getDecoratorParams(nameOrObjectParam);
        case 'Trigger':
            const config = getDecoratorParams(nameOrObjectParam);
            config.displayText = config.displayText ?? "{my} {title}";

            if (config.isFakeTrigger) {
                config.isTrigger = false;
            } else {
                config.isTrigger = true;
            }
            // config.isFakeTrigger = !config.isTrigger;
            return config;
        default:
            throw new Error("Trying to get configuration from an Unexpected Ace decorator");
    }
}

function formatAutoCompleteId(autocompleteId, paramId, methodId) {
    if (autocompleteId === true) {
        autocompleteId = `${methodId}:${paramId}`;
    } else if (typeof autocompleteId === typeof '') {
        autocompleteId = autocompleteId.trim();
    } else {
        return;
    }

    autocompleteId = `${partialAddonJson.id}:${autocompleteId}`;

    if (bc().autoCompleteHash) {
        autocompleteId = md5(autocompleteId);
    }

    return autocompleteId;
}

function formatParam(param = {}, methodId = null) {
    let id, initialValue, type, autocompleteId;

    if (param.type === 'Identifier') {
        id = param.name;
        type = getParserType(param.typeAnnotation);
    } else if (param.type === 'AssignmentPattern') {
        id = param.left.name;
        type = getParserType(param.left.typeAnnotation);
        initialValue = param.right.value;
    } else {
        throw new Error(`Unhandled ACE parameter assignation. Try using the '@${PARAM_DECORATOR}' decorator or typings.`);
    }

    let config = (param.decorators ?? [])?.filter((v) => v.expression.callee?.name === PARAM_DECORATOR);

    if (config.length > 1) {
        throw new Error(`Decorator '@${PARAM_DECORATOR}' must be declared once per parameter`);
    }

    config = getDecoratorParams(config[0]?.expression?.arguments[0]);
    autocompleteId = formatAutoCompleteId(config.autocompleteId, id, methodId);

    return {
        ...config,
        id: config.id ?? id,
        name: config.name ?? titleCase(id),
        desc: config.desc ?? '',
        type: config.type ?? type ?? 'any',
        ...(initialValue ? { initialValue } : {}),
        ...(autocompleteId ? { autocompleteId } : {})
    }
}

/**
 * @param {import('../../ts/types/config.js').BuildConfig} config
 * @param {import('../../ts/types/config.js').BuiltAddonConfig} addon
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
        ...(addon.addonType !== 'theme' ? {
            "editor-scripts": addon?.editorScripts ?? [],
        } : {
            stylesheets: [
                'theme.css'
            ]
        }),
        "file-list": [
            "addon.json",
            ...(addon.addonType !== 'theme' ? [
                "aces.json",
                ...(addon?.editorScripts ?? []),
                "c3runtime/actions.js",
                "c3runtime/conditions.js",
                "c3runtime/expressions.js",
                "c3runtime/instance.js",
                `c3runtime/${addon.addonType}.js`,
                "c3runtime/type.js",
            ] : [
                'theme.css'
            ]),
            ...getLangs().map((v) => `lang/${v}.json`),
            // TODO: Add language list
            addon.icon ? addon.icon : "icon.svg",
            ...Object.keys(addon.fileDependencies),
            ...addon.typeDefs,
        ],
    };
}

function getLangs() {
    const config = bc();
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

    return langs;
}

function langFromConfig(config, addon, aces) {
    let configs = {};

    getLangs().forEach((languageTag) => {
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
        } else if (addon.addonType === 'theme') {
            lang.text.themes = {};
            lang.text.themes[id] = {};
            root = lang.text.themes[id];
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

        if (addon.properties) {
            root.properties = {};
            addon.properties?.forEach((property) => {
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
                    root.properties[property.id]["link-text"] = __(property.options.linkText);
                } else if (property.type === "info") {
                    root.properties[property.id]["info-text"] = __(property.options.infoText);
                }
            });
        }

        const ungroupedAces = Object.keys(aces)
            .reduce((dict, k) => {
                for (const type in dict) {
                    dict[type] = [...dict[type], ...aces[k][type]];
                }
                return dict;
            }, aceList());;

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
                        root.actions[action.id].params[param.id].items[itemkey] = __(item[itemkey]);
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
 * @param {import('../../ts/types/config.js').BuildConfig} config
 * @param {import('../../ts/types/config.js').BuiltAddonConfig} addon
 */
function distribute(config, addon) {
    const compiledAddonPath = filepath(config.exportPath, 'addon.json');

    if (!existsSync(compiledAddonPath)) throw new Error(`Invalid export. '${compiledAddonPath}' was not found!`);

    const compiledAddon = JSON.parse(readFileSync(compiledAddonPath, { encoding: 'utf-8' }));

    const fileList = compiledAddon['file-list'] ?? [];

    // zip the content of the export folder and name it with the plugin id and version and use .c3addon as extension
    const zipFolder = (suffix = '') => {
        const zip = new AdmZip();

        if (existsSync(filepath(config.exportPath, "c3runtime"))) {
            zip.addLocalFolder(filepath(config.exportPath, "c3runtime"), "c3runtime");
        }
        zip.addLocalFolder(filepath(config.exportPath, "lang"), "lang");

        fileList.forEach(file => {
            if (
                file.startsWith('c3runtime/') ||
                file.startsWith('lang/')
            ) {
                return;
            }

            // for each remaining file in the root export folder

            const dir = dirname(file);
            const path = filepath(config.exportPath, file);

            zip.addLocalFile(path, dir);
        });

        const distPath = filepath(config.distPath);

        // if dist folder does not exist, create it
        if (!existsSync(distPath)) {
            mkdirSync(distPath);
        }

        const c3AddonName = config.exportName
            .replace('$ID', addon.id)
            .replace('$SUFFIX', suffix)
            .replace('$VERSION', addon.version)
            .split('-')
            .filter((v) => v)
            .join('-');

        zip.writeZip(filepath(config.distPath, `${c3AddonName}.c3addon`));
    };

    if (addon.addonType == 'theme' && addon.variants) {
        const originalConfig = JSON.parse(JSON.stringify(config));

        config.exportPath = join(originalConfig.exportPath, addonJson.id);
        zipFolder();

        Object.keys(addon.variants).forEach((theme) => {
            config.exportPath = join(originalConfig.exportPath, `${addonJson.id}-${theme}`);

            zipFolder(theme);
        });

        config = originalConfig;
        return;
    }


    zipFolder();
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

function displayTextWithParams(displayText, params) {
    displayText = displayText.trim();

    return displayText + " (" + Object.keys(params).map(v => `{${v}}`).join(', ') + ")";
}

function displayTextStripParams(displayText) {
    return displayText.replace(/{\d+}(,\s+{\d+})*/, '')
        .replace(/{\d+}|{my}/g, '')
        .replace(/\s+/, ' ')
        .replace(/\(\s?\)/, '')
        .trim();
}


function getTitlesFromACE(config, id, title, params, isExpression = false) {

    let displayText = config.displayText;

    if (!displayText) {
        // Auto-assign params to display text
        if (params.length) {
            displayText = displayTextWithParams(title, params);
        } else {
            displayText = title;
        }
    }

    const listName = config.listName ??
        (!isExpression ? displayTextStripParams(displayText) : id);

    return {
        displayText: displayText.replace("{title}", title),
        listName: listName.replace("{title}", title),
    }

}

function searchACE(aceType, regex) {
    const actionKey = Object.keys(acesRuntime[aceType]).find((k) => k.match(regex));

    let action;

    for (const key in aces) {
        const aceCategory = aces[key];

        for (let index = 0; index < aceCategory[aceType].length; index++) {
            const unkownAction = aceCategory[aceType][index];

            if (unkownAction.id === actionKey) {
                action = unkownAction;
                break;
            }
        }
    }

    return action;
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

        /** @type {import('../../types/decorators.js').IAceClass} */
        const aceClassConfig = getDecoratorParams(aceClass.expression?.arguments[0]);

        /** @type {import('acorn').Node[]} */
        const classFeatures = classDeclaration.body.body;
        const methodAces = classFeatures.filter(v => v.type == 'MethodDefinition' && v.decorators?.length && Object.keys(ACE_DECORATORS).includes(v.decorators[0]?.expression.callee?.name));

        methodAces.forEach(v => {
            const key = v.key.name;
            let id = v.key.name;
            const title = titleCase(id);

            if (v.decorators.length > 1) {
                throw new Error(`Method '${id}' can only be one ACE`);
            }

            const decorator = v.decorators[0];

            const decoratorName = decorator.expression.callee.name;
            const aceType = ACE_DECORATORS[decoratorName];
            // ACE_TYPES[decorator.expression.callee.name];

            if (!aceType) {
                throw new Error(`Unkown ACE operation on '${id}'`);
            }

            removeDecorator(decorator);

            const decoratorParams = decorator.expression.arguments;

            if (decoratorParams?.length > 1) {
                if (decoratorParams.length > 2 || decoratorParams[1].type !== 'ObjectExpression') {
                    throw new Error(`You must pass an object as option argument on '${id}' ACE`);
                }
            }

            const config = getAceDecoratorConfig(decoratorName, decoratorParams);

            if (config.id) {
                id = config.id;
            }

            let returnType = config?.returnType;

            const method = v.value;

            if (config.isAsync === undefined && method.async === true) {
                config.isAsync = true;
            }

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
                // Ignore variadic arguments
                if (v.type === 'RestElement') {
                    return null;
                }

                return formatParam(v, id);
            }).filter((v) => v) ?? [];

            const { displayText, listName } = getTitlesFromACE(config, id, title, params, decoratorName === "Expression");

            if (!aces[category]) {
                aces[category] = {};
                for (const type in ACE_TYPES) {
                    aces[category][type] = [];
                }
            }

            acesRuntime[aceType][id] = `(inst) => inst["${key}"]`;
            aces[category][aceType].push({
                ...config,
                id,
                scriptName: key,
                displayText,
                listName,
                category,
                params,
                description: config.description ?? '',
                ...(returnType ? { returnType } : {}),
            });
        });

        (aceClassConfig.triggers ?? []).forEach((v) => {
            if (typeof v === typeof '') {
                if (!v.startsWith('on')) {
                    throw new Error("String triggers should start with 'on{MyAction}'");
                }

                v = { id: v }
            }

            const baseName = v.id.replace(/^on/, '');
            const expressionName = lowerFirst(baseName);

            const expression = searchACE(ACE_DECORATORS.Expression, expressionName)
            const action = searchACE(ACE_DECORATORS.Action, new RegExp("(get|load)" + baseName));

            let category = v.category ?? 'general';

            if (expression) {
                category = expression.category;
            } else if (action) {
                category = action.category;
            } else if (!v.category) {
                console.warn(`String trigger "${v.id}" without expression or action detected. Defaulting to "general" category`);
            }

            const title = titleCase(v.id);
            const { displayText, listName } = getTitlesFromACE({}, v.id, title, []);
            let description = '';

            if (action) {
                description += `Triggers after calling [b]${action.listName}[/b].`;
            }

            if (expression) {
                description += ` Use [b]${expression.listName}[/b] expression.`;
            }

            description = description.trim();

            v = {
                description,
                displayText,
                listName,
                params: [],
                isTrigger: true,
                category,
                ...v,
            }

            if (!aces[v.category]) {
                aces[v.category] = {};
                for (const type in ACE_TYPES) {
                    aces[v.category][type] = [];
                }
            }

            aces[v.category][ACE_DECORATORS.Condition].push(v);
            acesRuntime[ACE_DECORATORS.Condition][v.id] = `() => () => true`;
        });
    });

    const contents = esbuild.transformSync(ts, {
        loader: 'ts',
        format: 'esm',
        treeShaking: true,
        minifySyntax: false,
        tsconfigRaw: tsConfig(),
    }).code;

    return {
        contents
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

                const parsed = parseScript(ts)

                return parsed;
            });

        }
    };
}

export function writeLanguages() {
    const config = bc();
    const langs = langFromConfig(config, addonJson, aces);

    for (const lang in langs) {
        const langFile = langs[lang];
        writeFileSync(filepath(config.exportPath, "lang/", lang + ".json"), JSON.stringify(langFile, null, 2));
    }
}

export async function writeAddonConfig() {
    const config = bc();
    writeFileSync(filepath(config.exportPath, "addon.json"), JSON.stringify(await addonFromConfig(config, addonJson), null, 2))
}

function instanceShouldExtendClass() {
    const config = bc();

    if (addonJson.interface?.instanceParentName) {
        return addonJson.interface.instanceParentName;
    }

    if (addonJson.addonType === 'plugin') {
        const pluginTypes = {
            "object": "IWorldInstance", // Yep everyting is IWorldInstance in C3, even non-world plugins
            "world": "IWorldInstance",
            "dom": "IDOMInstance",
        };

        return pluginTypes[addonJson.type];
    }

    return "IBehaviorInstance";
}

export function writeAddonScriptingInterface() {
    const config = bc();

    const opts = typeof addonJson.interface !== 'object' ? {} : addonJson.interface;

    const className = opts.instanceName ?? addonJson.id;
    const eventMapName = `${className}EventMap`;
    const isBehavior = addonJson.addonType === 'behavior';
    const generic = isBehavior ? '<InstType>' : '';
    const parentClassName = instanceShouldExtendClass();

    let ts = '';
    const TAB = '  ';

    const registerTriggers = opts.autoGenerateTriggers ?? true;
    const triggers = [];

    function generateDocBlock(content = [], tabs = 0, end = undefined) {
        content = typeof content === 'string' ? [content] : content;

        let indentation = '';
        for (let i = 0; i < tabs; i++) {
            indentation += TAB;
        }

        const docblockBr = `\n${indentation} * `;

        let docblock = '';

        docblock += `${indentation}/**`;

        content.forEach((line) => {
            line = line.trim()

            if (!line) return docblock += docblockBr;

            docblock += docblockBr + wordWrap(line, 100, docblockBr)
        });

        if (end) {
            const added = end(indentation);
            docblock += added !== undefined ? added : '';
        }

        docblock += `\n${indentation} */\n`;

        return docblock;
    }

    ts += generateDocBlock([
        `Represents an instance of the plugin ${addonJson.id}.`,
        '',
        `@description ${endsWithDot(addonJson.description)}`,
        `@version ${addonJson.version}`
    ])

    ts += `declare class ${className}${generic} extends ${parentClassName}${generic}\n{\n`;

    if (registerTriggers) {
        if (isBehavior) {
            ts += `${TAB}addEventListener<K extends keyof ${eventMapName}<InstType, this>>(type: K, listener: (ev: ${eventMapName}<InstType, this>[K]) => any): void;\n`
            ts += `${TAB}removeEventListener<K extends keyof ${eventMapName}<InstType, this>>(type: K, listener: (ev: ${eventMapName}<InstType, this>[K]) => any): void;\n`
        } else {
            ts += `${TAB}addEventListener<K extends keyof ${eventMapName}<this>>(type: K, listener: (ev: ${eventMapName}<this>[K]) => any): void;\n`
            ts += `${TAB}removeEventListener<K extends keyof ${eventMapName}<this>>(type: K, listener: (ev: ${eventMapName}<this>[K]) => any): void;\n`
        }

        ts += '\n';
    }

    for (const categoryName in aces) {
        for (const type in aces[categoryName]) {
            const definitions = aces[categoryName][type]

            definitions.forEach((definition) => {
                if (definition.isTrigger && registerTriggers) {
                    triggers.push(definition);
                    return;
                }

                let isAsync = definition.isAsync;

                if (definition.description) {
                    ts += generateDocBlock(definition.description, 1, (docblockBr) => {
                        if (definition.deprecated) {
                            return docblockBr + '@deprecated'
                        }
                    })
                }

                ts += TAB;

                if (isAsync) {
                    ts += "async ";
                }

                ts += definition.scriptName;

                if (!definition.params?.length) {
                    ts += '()'
                } else {
                    ts += '(';

                    definition.params.forEach((paramDef) => {
                        ts += '\n';

                        if (paramDef.desc) {
                            ts += `${TAB}${TAB}/** ${paramDef.desc} */\n`;
                        }

                        ts += `${TAB}${TAB}${paramDef.id}: ${paramDef.type}`;

                        let value = paramDef.initialValue

                        if (value) {
                            if (!value.match(/"[^"]*"|'[^']*'/)) {
                                value = JSON.stringify(value);
                            }

                            ts += ` = ${value}`;
                        }

                        ts += ','
                    })
                    ts += `\n${TAB})`;
                }

                // Return type
                const returnType = definition.returnType ?? 'void';
                ts += `: `;
                ts += isAsync ? `Promise<${returnType}>` : returnType;
                ts += '; \n\n';
            });
        }
    }

    ts += '}\n';

    if (registerTriggers) {
        let triggersTs = '';

        if (isBehavior) {
            triggersTs += `interface ${eventMapName}<InstType, BehInstType> extends BehaviorInstanceEventMap<InstType, BehInstType> {\n`

            triggers.forEach((trigger) => {
                triggersTs += `${TAB}"${trigger.scriptName}": BehaviorInstanceEvent<InstType, BehInstType>;\n`
            });

            triggersTs += "}"
        } else {
            triggersTs += `interface ${eventMapName}<InstType = ${className}> extends WorldInstanceEventMap<InstType> {\n`;

            triggers.forEach((trigger) => {
                triggersTs += `${TAB}"${trigger.scriptName}": InstanceEvent<InstType>;\n`
            });

            triggersTs += "}"
        }

        ts = `${triggersTs}\n\n${ts}`;
    }

    ts = ts.trim() + '\n';

    writeFileSync(filepath(config.exportPath, `${className}.d.ts`), ts);
}

export function writeIcon() {
    const config = bc();

    if (addonJson.icon) {
        copyFileSync(filepath(config.sourcePath, addonJson.icon), filepath(config.exportPath, addonJson.icon));
    } else {
        copyFileSync(filepath(config.sourcePath, "icon.svg"), filepath(config.exportPath, "icon.svg"));
    }
}

// TODO: Abstract everything from the parser to its own parser module
async function build() {
    const config = await loadBuildConfig();

    // Only use to check initial config, don't use for ACE check
    const partialAddonJson = await readAddonConfig(filepath(config.sourcePath, config.addonScript));

    setPartialAddonJson(partialAddonJson);

    if (partialAddonJson.addonType === 'theme') {
        await buildTheme();
        return;
    }

    ensureFoldersExists();
    createEmptyFiles();

    const main = await buildFile(filepath(config.sourcePath, config.runtimeScript), config, [parseAces(config)]);

    if (!addonJson) {
        throw new Error(`Addon wasn't parsed properly. This may be due of not being able to find '${config.addonScript}'`);
    }

    // addonJson is now available to use

    writeFileSync(filepath(config.exportPath, `c3runtime/${addonJson.addonType}.js`), main);
    writeFileSync(filepath(config.exportPath, "aces.json"), JSON.stringify(acesFromConfig(aces), null, 2));

    writeLanguages();

    await writeAddonConfig();

    if (addonJson.interface !== false && (addonJson.interface.autoGenerate ?? true)) {
        writeAddonScriptingInterface();
    }

    await Promise.all(
        addonJson.editorScripts?.map(async (v) => {
            if (!v.match(/\.(js|ts)$/)) {
                throw new Error(`Editor script path '${v}' is neither a JavaScript nor TypeScript path`);
            }

            const tsPath = v.trim().replace(/\.js$/, '.ts');
            const jsPath = v.trim().replace(/\.ts$/, '.js');

            const path = filepath(config.sourcePath, tsPath);
            const outpath = filepath(config.exportPath, jsPath);

            return await buildFile(path, config).then((editor) => {
                return writeFileSync(outpath, editor, { encoding: 'utf-8' });
            });
        }) ?? []
    );

    writeIcon();
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

export let isDev = false;

export default async function (devBuild = false, serverOpts = {}, {
    dist = true
} = {}) {
    isDev = devBuild;
    if (devBuild) {
        runServer(async () => {
            aces = {};
            acesRuntime = aceDict();
            resetParsedConfig();

            await build();
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
