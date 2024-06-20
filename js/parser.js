import * as esbuild from 'esbuild';
import { tsConfig } from './config.js';
import { mutateAddonConfig, parseAddonScript } from './parser/addonConfig.js';
import { escapeRegExp } from './utils.js';
import { acesRuntime } from '../bin/commands/build.js';
import { join } from 'path';

/** @type {import('../index.js').BuiltAddonConfig} */
export let addonJson;

/**
 * @param {import('../../types/config.js').BuildConfig} config  
 * @returns {import('esbuild').Plugin} 
 */
function parserAddon(config) {
    const addonScript = new RegExp(escapeRegExp(join(config.sourcePath, config.addonScript)) + '$');

    return {
        name: 'c3framework-parser-addon',
        setup(build) {
            build.onLoad({ filter: addonScript }, async (config) => {
                const contents = () => ({ contents: "export default " + JSON.stringify(addonJson) });

                if (addonJson) return contents();

                const addon = await parseAddonScript(config.path, acesRuntime);
                addonJson = await mutateAddonConfig(addon);

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