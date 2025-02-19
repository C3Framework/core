import * as esbuild from 'esbuild';
import { tsConfig } from './config.js';
import { addonToJson, mutateAddonConfig, parseAddonScript } from './parser/addonConfig.js';
import { escapeRegExp } from './utils.js';
import { acesRuntime } from '../bin/commands/build.js';
import { join } from 'path';

/** @type {import('../index.js').BuiltAddonConfig} */
export let addonJson;

export let partialAddonJson;

export function setAddonJson(v) {
    addonJson = v;
}

export function setPartialAddonJson(v) {
    partialAddonJson = v;
}

export async function loadAddonConfig(path) {
    if (addonJson) return addonJson;

    addonJson = await readAddonConfig(path);
}

/**
 * Be aware that if this is not read before of the
 * parcing of @AceClass, no ACE will be included
 * @param {string} path 
 * @returns 
 */
export async function readAddonConfig(path) {
    let addon = await parseAddonScript(path, acesRuntime);
    addon = await mutateAddonConfig(addon);
    return addon;
}

/**
 * @param {import('../types/config.js').BuildConfig} config  
 * @returns {import('esbuild').Plugin} 
 */
function parserAddon(config) {
    const addonScript = new RegExp(escapeRegExp(join(config.sourcePath, config.addonScript)) + '$');

    return {
        name: 'c3framework-parser-addon',
        setup(build) {
            build.onLoad({ filter: addonScript }, async (file) => {
                const contents = () => ({ contents: "export default " + addonToJson(addonJson, config) });

                if (addonJson) return contents();

                await loadAddonConfig(file.path)

                return contents();
            });
        }
    }
}

export function resetParsedConfig() {
    addonJson = null;
}

export async function buildFile(file = '', config = {}, plugins = []) {
    return await esbuild.build({
        entryPoints: [file],
        bundle: true,
        allowOverwrite: true,
        plugins: [
            parserAddon(config),
            ...plugins,
        ],
        write: false,
        tsconfigRaw: tsConfig(),
        minify: config?.minify ?? true,
    }).then(v => v.outputFiles[0].text);
}