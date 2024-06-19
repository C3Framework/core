import { getByPath } from "dot-path-value";
import { buildConfig } from "./config.js";
import { filepath } from "./utils.js";
import { existsSync, readFileSync } from 'fs';

let _activeLang;
let _langLoaded = {};

export function resetLoadedLangs() {
    _langLoaded = {};
}

export function loadLanguage(lang) {
    const bc = buildConfig();
    const path = filepath(bc.langPath, lang + ".json");

    _activeLang = lang;

    if (_langLoaded[lang]) {
        return _langLoaded[lang];
    }

    if (!existsSync(path)) {
        return _langLoaded[lang] = {};
    }

    return _langLoaded[lang] = JSON.parse(readFileSync(path, { encoding: 'utf-8' }));
}

export function __(key) {
    const bc = buildConfig();

    return getByPath(_langLoaded[_activeLang] ?? _langLoaded[bc.defaultLang] ?? {}, key) ?? key;;
}