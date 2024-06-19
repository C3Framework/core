import { tsConfig } from "../config.js";
import * as esbuild from 'esbuild';
import { ACE_TYPES, aceDict } from "../constants.js";
import { buildConfig } from "../config.js";
import { getFileListFromConfig, getTypeDefinitions } from "./scanners.js";
import { readFileSync } from 'fs';

export async function parseAddonScript(path, acesRuntime = null) {
    const content = readFileSync(path, { encoding: 'utf-8' });
    const inject = JSON.stringify(acesRuntime ?? aceDict(), null, 4).replace(/"(\(inst\) => inst\.[a-zA-Z0-9$_]+)"/, '$1');
    const injected = content.replace(/(export\s+default\s+)([^;]+);/, `$1{\n...($2), \n...({Aces: ${inject}})\n};`);

    const jsConfig = esbuild.transformSync(injected, {
        loader: 'ts',
        tsconfigRaw: tsConfig(),
    }).code;

    let addon;

    try {
        addon = await addonScriptToObject(jsConfig);
    } catch (error) {
        throw Error("Error on addon config. Please be sure to not execute external libraries from there." + "\n" + error);
    }

    return addon;
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
        throw Error("Error on reading Addon Config. Please be sure to not execute external libraries from there." + "\n" + error);
    }

    // * Remove ACEs
    for (const key in ACE_TYPES) {
        delete config[key];
    }

    return config;
}

export async function mutateAddonConfig(addon) {
    const bc = buildConfig();

    // * Dependencies files
    const dependencies = await getFileListFromConfig(bc, addon);
    addon.fileDependencies = dependencies;

    // * Type definitions
    const typeDefs = getTypeDefinitions(bc);

    addon.typeDefs = typeDefs;

    return addon;
}