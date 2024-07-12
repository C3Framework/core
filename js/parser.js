import * as esbuild from 'esbuild';
import { tsConfig } from './config.js';
import { addonToJson, mutateAddonConfig, parseAddonScript } from './parser/addonConfig.js';
import { escapeRegExp } from './utils.js';
import { acesRuntime } from '../bin/commands/build.js';
import { join } from 'path';

/** @type {import('../index.js').BuiltAddonConfig} */
export let addonJson;

export function setAddonJson(v) {
    addonJson = v;
}

export async function loadAddonConfig(path) {
    if (addonJson) return addonJson;

    const addon = await parseAddonScript(path, acesRuntime);
    addonJson = await mutateAddonConfig(addon);
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