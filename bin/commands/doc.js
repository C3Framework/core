import { loadBuildConfig } from "../../js/config.js";
import { template } from "../../js/templates.js";
import { readdirSync, writeFileSync } from 'fs';
import { filepath } from "../../js/utils.js";
import { parseAddonScript } from "../../js/parser/addonConfig.js";
import { join } from "path";
import * as cli from '../../js/cli.js';
import chalk from "chalk";

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

            if (images) {
                const image = "./" + join(config.examplesPath, images[0]);

                elements.push(`<img src="${image}" width="200" />`);
            }

            return elements.join('\n<br>\n') + '\n<br>';
        });

    return examples.join('');
}

function getProperties(addon) {
    return addon.properties.map((property) => `| ${property.name} | ${property.desc} | ${property.type} |`).join("\n");
}

export default async function () {
    cli.clear();
    cli.log(cli.center('Generating documentation...', chalk.italic));

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
        frameworkUrl: 'https://github.com/MasterPose/c3-framework',
    });

    md = md.replace("{{$examples}}", getExampleList(config));
    md = md.replace("{{$properties}}", getProperties(addon));

    writeFileSync(filepath('./README.md'), md);

    console.log(cli.center('Generated README.md!', chalk.blueBright.bold) + '\n');
}
