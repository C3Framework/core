import { pathToFileURL } from 'url';
import { filepath } from './utils.js';
import fs from 'fs';

/** @type {import('../types/config.js').BuildConfig} */
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
    themeStyle: 'theme.scss',
    defPath: 'src/',
    exportPath: 'export/',
    examplesPath: 'examples/',
    distPath: 'dist/',
};

/** @type {import('../types/config.js').BuildConfig} */
let _buildConfig;

/**  @returns {import('../types/config.js').BuildConfig} */
export function buildConfig() {
    if (!_buildConfig) throw Error('Trying to access build config before initialization');

    return _buildConfig;
}

/** @returns {Promise<import('../types/config.js').BuildConfig>} */
export async function loadBuildConfig() {
    if (_buildConfig) {
        return _buildConfig;
    }


    const configPath = filepath('./c3.config.js');
    if (fs.existsSync(configPath)) {
        const loadedConfig = await import(pathToFileURL(configPath)).then(v => v.default);
        _buildConfig = { ...defaultConfig, ...loadedConfig };
        return _buildConfig;
    }

    return _buildConfig = defaultConfig;
}

let _tsConfig;
export function tsConfig() {
    if (_tsConfig) {
        return _tsConfig;
    }

    return _tsConfig = fs.readFileSync(filepath('./tsconfig.json')).toString('utf8');
}