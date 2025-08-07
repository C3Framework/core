import { tsConfig } from "../config.js";
import * as esbuild from 'esbuild';
import { ACE_TYPES, aceDict } from "../constants.js";
import { buildConfig } from "../config.js";
import { getFileListFromConfig, getTypeDefinitions } from "./scanners.js";
import { readFileSync } from 'fs';
import { parse as parseJs } from "acorn";
import escodegen from 'escodegen';

export async function parseAddonScript(path, acesRuntime = null) {
    const content = readFileSync(path, { encoding: 'utf-8' });
    const inject = JSON.stringify(acesRuntime ?? aceDict(), null, 4);
    const injected = content.replace(/(export\s+default\s+)([^;]+);/, `$1{\n...($2), \n...({Aces: ${inject}})\n};`);

    const jsConfig = esbuild.transformSync(injected, {
        loader: 'ts',
        tsconfigRaw: tsConfig(),
    }).code;

    let addon;

    try {
        addon = await addonScriptToObject(jsConfig);
    } catch (error) {
        throw new Error("Error on addon config. Please be sure to not execute external libraries from there." + "\n" + error);
    }

    return addon;
}

export function addonToJson(addon, config = {}) {
    for (const property of addon.properties) {
        const shouldBeParsed = {
            'link': 'linkCallback',
            'info': 'infoCallback',
        }[property.type];

        if (shouldBeParsed) {
            const ast = parseJs(property.options[shouldBeParsed] ?? '() => {}', {
                ecmaVersion: '2022',
            });
            const minified = escodegen.generate(ast, { format: { compact: true, semicolons: false } });

            property.options[shouldBeParsed] = minified;
        }

        if (property.options?.items) {
            if (!Array.isArray(property.options.items)) {
                property.options.items = Object.keys(property.options.items);
            }
        }
    }

    let json = JSON.stringify(addon, null, !config?.minify ? 4 : undefined);

    json = json.replace(/('|")(\(inst\) => inst\[\\?('|")([a-zA-Z0-9$_]+)\\?\3\]|((\(\) => \(\) => true)))\1/g, (_match, _p1, p2, _p3, p4) => {
        if (p4) {
            return `(inst) => inst["${p4}"]`;
        }

        return p2;
    }).replace(
        /"(linkCallback|infoCallback)": "(.*)",?$/gm, '"$1": $2'
    );

    return json;
}

async function addonScriptToObject(tsAddonConfig = '') {
    const getConfig = new Function(
        esbuild.transformSync(tsAddonConfig, {
            format: 'iife',
            globalName: 'config',
            loader: 'js'
        }).code + ' return config;'
    );

    let config;

    try {
        config = getConfig().default;
    } catch (error) {
        throw new Error("Error on reading Addon Config. Please be sure to not execute external libraries from there." + "\n" + error);
    }

    // * Remove ACEs
    for (const key in ACE_TYPES) {
        delete config[key];
    }

    return config;
}

export async function mutateAddonConfig(addon) {
    const bc = buildConfig();

    // * Files List
    const fileList = await getFileListFromConfig(bc, addon);
    addon.files = fileList;

    // * Interfaces
    if (addon.interface === true || addon.interface === undefined) {
        addon.interface = {};
    }

    // * Type definitions
    const typeDefs = getTypeDefinitions(bc, addon);
    addon.typeDefs = typeDefs;

    return addon;
}
