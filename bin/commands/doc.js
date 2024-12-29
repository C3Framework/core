import { loadBuildConfig } from "../../js/config.js";
import { template } from "../../js/templates.js";
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { filepath } from "../../js/utils.js";
import { parseAddonScript } from "../../js/parser/addonConfig.js";
import { join } from "path";
import * as cli from '../../js/cli.js';
import chalk from "chalk";
import build from "./build.js";
import { PLURAL_ADDON } from "../../js/constants.js";

function getExampleList(config) {
    const examplesPath = filepath(config.examplesPath);
    const examples = readdirSync(examplesPath)
        .filter((filename) => filename.endsWith('.c3p'))
        .map((filename) => {
            const name = filename.replace(/\.c3p$/, '');
            const path = './' + join(config.examplesPath, filename);

            const list = `- [${name}](${path})`;
            const elements = [list];

            const images = readdirSync(examplesPath).filter((img) => img.match(/\.(jpg|png|gif|jpeg)$/) && img.startsWith(name));

            if (images.length) {
                const image = "./" + join(config.examplesPath, images[0]);

                elements.push(`<img src="${image}" width="200" />`);
            }

            return elements.join('\n<br>\n') + '\n<br>';
        });

    return examples.join('');
}

function getProperties(addon) {
    return addon.properties.map((property) => {
        const desc = (property.desc ?? '').replace(/\n+/g, ' ');
        return `| ${property.name} | ${desc} | ${property.type} |`;
    }).join("\n");
}

function getAces(aces, lang) {
    const get = (type, withReturnType = false) => {
        const line = [];
        Object.keys(aces).forEach(categoryKey => {
            const category = aces[categoryKey];

            category[type].forEach((ace) => {
                const aceLang = lang[type][ace.id];

                let paramString = "";
                if (ace.params) {
                    ace.params.forEach((param) => {
                        const paramLang = aceLang.params[param.id];
                        paramString += `${paramLang.name} *(${param.type})* <br>`;
                    });
                }

                const desc = aceLang['description'].replace(/\n+/, ' ');
                line.push(
                    `| ${aceLang['list-name'] ?? aceLang['translated-name']} | ${desc} |` + (withReturnType ? ` ${ace.returnType} |` : '') + ` ${paramString} |`
                );
            });
        });
        return line;
    };

    const actions = get('actions');
    const conditions = get('conditions');
    const expressions = get('expressions', true);

    return [actions, conditions, expressions];
}

export default async function () {
    cli.clear();
    cli.log(cli.center('Starting generation...', chalk.italic));

    const config = await loadBuildConfig();

    /** @type {import("../../types/config.js").AddonConfig} */
    const addon = await parseAddonScript(filepath(config.sourcePath, config.addonScript));

    let md = template('doc.md', {
        name: addon.name,
        icon: './' + join(config.sourcePath, addon.icon ?? 'icon.svg'),
        description: addon.description,
        version: addon.version,
        website: addon.website,
        author: addon.author,
        addonUrl: addon.addonUrl,
        githubUrl: addon.githubUrl,
        addonScript: config.addonScript,
        runtimeScript: config.runtimeScript,
        frameworkUrl: 'https://github.com/C3Framework/framework',
    });

    md = md.replace("{{$examples}}", getExampleList(config));
    md = md.replace("{{$properties}}", getProperties(addon));

    cli.loading('Building project...');

    // * We call build to generate the doc from the parsed ACEs
    // * This could be refactored, to only parse the ACEs without building

    cli.off();

    await build(false, {}, {
        distribute: false
    });

    cli.on();

    cli.loading('Analyzing ACEs...');

    const lang = JSON.parse(readFileSync(filepath(config.exportPath, 'lang/', config.defaultLang + ".json"), { encoding: 'utf-8' }));
    const aces = JSON.parse(readFileSync(filepath(config.exportPath, "aces.json"), { encoding: 'utf-8' }));

    const langAddon = lang['text'][PLURAL_ADDON[addon.addonType]][addon.id.toLowerCase()];

    const [actions, conditions, expressions] = getAces(aces, langAddon);

    md = md.replace("{{$actions}}", actions.join("\n"));
    md = md.replace("{{$conditions}}", conditions.join("\n"));
    md = md.replace("{{$expressions}}", expressions.join("\n"));

    writeFileSync(filepath('./README.md'), md);

    cli.line('Generated README.md!', chalk.blueBright.bold);
}
