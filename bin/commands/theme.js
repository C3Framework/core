import { buildConfig as bc, loadBuildConfig, tsConfig } from '../../js/config.js';
import { addonJson, loadAddonConfig } from "../../js/parser.js";
import { filepath, removeFilesRecursively, titleCase } from '../../js/utils.js';
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
import { writeAddonConfig, writeIcon, writeLanguages } from './build.js';
import * as sass from 'sass';
import convert from 'color-convert';
import { hexToFilter } from '../../js/vendor/hexToFilter.js';

const BODIES_TARGETS = ['body', '#startPage2Wrap', '#exampleBrowserWrap'];

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
}

/** @type {import('../../types/config.js').ThemeConfig} */
let themeJson;

function generateShades(hex, range = 33) {
    hex = hex.replace('#', '');
    const mid = convert.hex.hsl(hex);
    const midLight = mid[2];
    const colors = [];

    const baseIndex = Math.floor((8 / 33) * range);

    // Up
    const stepsUp = baseIndex;
    for (let i = 0; i < baseIndex - 1; i++) {
        colors.push([
            mid[0],
            mid[1],
            (midLight / stepsUp) * i
        ]);
    }

    colors.push(mid);

    // Down
    const leftLight = 100 - midLight;
    const stepsDown = range - baseIndex;
    for (let i = 1; i < stepsDown + 1; i++) {
        colors.push([
            mid[0],
            mid[1],
            Math.min(
                midLight + (leftLight / stepsDown) * i,
                100
            )
        ]);
    }

    const hexs = colors.map((v) => '#' + convert.hsl.hex(v))

    return hexs;
}

function generateColorStyles(hex, name) {
    hex = hex.replace('#', '');

    let color = [
        `--${name}: #${hex}`,
        `--${name}-rgb: ${convert.hex.rgb(hex).join(', ')}`,
        `--${name}-raw: ${convert.hex.rgb(hex).join(', ')}`,
        `--${name}-filter: ${hexToFilter(hex)}`,
    ].join(';\n') + ';';

    return color;
}
function appendPallete(css) {
    const pallete = themeJson.colors.pallete;

    const append = [
        ...BODIES_TARGETS.join(),
        '{',
        ...Object.keys(pallete).map((k) => `\n/* ${titleCase(k)} */\n` + generateColorStyles(pallete[k], k)),
        '}'
    ].join('');

    return append + css;
}

function appendBackground(css) {
    let background = themeJson.colors.background;

    if (typeof background === typeof '') {
        background = generateShades(background);
    }

    const append = [
        ...BODIES_TARGETS.join(),
        '{',
        ...background.map((v, i) => generateColorStyles(v, `gray${i}`)),
        '}',
    ].join('');

    return append + css;
}

function compile(entryPoint, isString = false) {
    const config = bc();

    const compile = isString ? sass.compileString : sass.compile;
    const result = compile(entryPoint, {
        charset: false,
        style: config.minify ? 'compressed' : 'expanded'
    });

    return result.css;
}

export async function buildTheme() {
    const config = await loadBuildConfig();

    await loadAddonConfig(filepath(config.sourcePath, config.addonScript));

    themeJson = addonJson;

    ensureFoldersExists();

    writeLanguages();
    writeAddonConfig();

    writeIcon();

    const entryPoint = filepath(config.sourcePath, config.themeStyle);

    let css = compile(entryPoint);
    css = appendBackground(css);
    css = appendPallete(css);
    css = compile(css, true);

    writeFileSync(
        filepath(config.exportPath, 'theme.css'),
        css
    );
}