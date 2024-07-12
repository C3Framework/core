import { buildConfig as bc, loadBuildConfig } from '../../js/config.js';
import { addonJson, loadAddonConfig, setAddonJson } from "../../js/parser.js";
import { filepath, removeFilesRecursively, titleCase } from '../../js/utils.js';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from 'fs';
import { isDev, writeAddonConfig, writeLanguages } from './build.js';
import * as sass from 'sass';
import convert from 'color-convert';
import { hexToFilter } from '../../js/vendor/hexToFilter.js';
import { join } from 'path';

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

    mkdirSync(filepath(exportPath), { recursive: true });
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

function writeIcon(primary, replace = null) {
    const config = bc();

    const filename = addonJson.icon ?? "icon.svg";
    const src = filepath(config.sourcePath, filename);
    const out = filepath(config.exportPath, filename);

    if (src.endsWith('.svg') && replace && (primary !== replace)) {
        let svg = readFileSync(src, { encoding: 'utf-8' });

        while (svg.includes(primary)) {
            svg = svg.replace(primary, replace);
        }
        writeFileSync(out, svg);

    } else {
        copyFileSync(src, out);
    }
}

export async function buildTheme() {
    const config = await loadBuildConfig();

    await loadAddonConfig(filepath(config.sourcePath, config.addonScript));

    themeJson = addonJson;

    /** @returns {import('../../types/config.js').ThemeConfig} */
    const cloneConfig = () => JSON.parse(JSON.stringify(themeJson));

    const primary = themeJson.colors?.pallete?.primary.toLowerCase();

    const build = (replace = null) => {
        ensureFoldersExists();

        writeLanguages();
        writeAddonConfig();

        writeIcon(primary, replace);

        const entryPoint = filepath(config.sourcePath, config.themeStyle);

        let css = compile(entryPoint);
        css = appendBackground(css);
        css = appendPallete(css);
        css = compile(css, true);

        writeFileSync(
            filepath(config.exportPath, 'theme.css'),
            css
        );
    };

    const variants = themeJson.variants;
    if (variants && !isDev) {
        const themes = Object.keys(variants).map((variant) => {
            const variantName = titleCase(variant);
            const variantConfig = cloneConfig();
            const overrides = variants[variant];

            delete variantConfig.variants;

            variantConfig.id = `${variantConfig.id}-${variant}`;
            variantConfig.name = variantConfig.name.trim() + ` (${variantName})`;
            variantConfig.colors.background = overrides.background ?? variantConfig.colors.background;
            variantConfig.colors.pallete = {
                ...(variantConfig.colors.pallete ?? {}),
                ...(overrides.pallete ?? {})
            };

            return variantConfig;
        });

        const main = cloneConfig()

        delete main.variants;

        themes.push(main);

        const originalConfig = JSON.parse(JSON.stringify(config));
        themes.forEach((theme) => {
            themeJson = {
                ...theme,
                variants
            };
            setAddonJson(themeJson);

            config.exportPath = join(originalConfig.exportPath, theme.id);

            build(themeJson.colors?.pallete?.primary.toLowerCase());
        });
        config.exportPath = originalConfig.exportPath;
        return;
    }

    build();
}