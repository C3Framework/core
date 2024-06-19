import { loadBuildConfig } from "../../js/config.js";
import { template } from "../../js/templates.js";
import { writeFileSync } from 'fs';
import { filepath } from "../../js/utils.js";

export default async function () {
    const config = await loadBuildConfig();

    let md = template('doc.md', {
        addonScript: config.addonScript,
        runtimeScript: config.runtimeScript
    });

    writeFileSync(filepath('./README.md'), md);
}
