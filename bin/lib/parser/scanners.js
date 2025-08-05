import { fileExtension, filepath, trimPathSlashes, writeFileRecursively } from '../utils.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, statfsSync } from 'fs';
import { isAbsolute, join } from 'path';
import { buildFile } from '../parser.js';
import { DEFAULT_IMPORT_TYPE } from '../constants.js';

function getImportTypeByExtension(ext) {
    switch (ext) {
        case 'css':
            return 'external-css';

        default:
            return DEFAULT_IMPORT_TYPE;
    }
}

async function processDependencyFile(config, filename, ext, type) {
    const input = filepath(config.libPath, filename);
    let output = filepath(config.exportPath, 'libs', filename);
    output = output.replace(/\.ts$/, '.js');

    if (ext === 'ts') {
        writeFileRecursively(output, await buildFile(input, config));
        return output;
    }

    writeFileRecursively(output, readFileSync(input));
    return output;
}

/**
 * @param {BuildConfig} config
 */
export function getTypeDefinitions(config, addon) {
    const dirPath = filepath(config.defPath);

    if (!existsSync(dirPath)) return [];

    const defPath = config.defPath;
    const exportPath = config.exportPath;
    const definitions = readdirSync(dirPath)
        .filter((v => v.endsWith('.d.ts')))
        .map((filename) => {

            const input = filepath(defPath, '/', filename);
            const output = input.replace(dirPath, filepath(exportPath, 'c3runtime/'))

            writeFileRecursively(output, readFileSync(input));

            return trimPathSlashes(output.replace(filepath(exportPath), ''));
        });

    if (addon.interface !== false && (addon.interface.autoGenerate ?? true)) {
        definitions.push((addon.interface.instanceName ?? addon.id) + '.d.ts');
    }

    return definitions;
}

/**
 * @param {import('../../ts/types/config.js').BuildConfig} config
 * @param {import('../../ts/types/config.js').BuiltAddonConfig} addon
 */
export async function getFileListFromConfig(config, addon) {
    const exportPath = filepath(config.exportPath);
    const libPath = filepath(config.libPath);
    const copyConfig = { ...(addon?.fileDependencies ?? {}) };

    if (!existsSync(libPath)) return {};

    const files = {};

    const scan = async (dirname) => {
        const promises = readdirSync(dirname).map(async (filename) => {
            if (filename.startsWith('.')) {
                return;
            }

            const fullPath = join(dirname, filename);

            if (statSync(fullPath).isDirectory()) {
                mkdirSync(filepath(config.exportPath, 'libs', fullPath.replace(libPath, '')), {
                    recursive: true
                });

                return scan(fullPath);
            }

            filename = trimPathSlashes(fullPath.replace(libPath, ''));

            const ext = fileExtension(filename);
            let importType;

            if (copyConfig[filename]) {
                importType = copyConfig[filename];
                delete copyConfig[filename];
            } else {
                importType = getImportTypeByExtension(ext);
            }

            let output = await processDependencyFile(
                config,
                filename,
                ext,
                importType
            );

            if (isAbsolute(output)) {
                output = trimPathSlashes(output.replace(exportPath, ''));
            }

            files[output] = importType;
        });

        return Promise.all(promises);
    };

    await scan(libPath);


    // There's a mismatch betwwen the files from libs and
    // the files on the config...
    // TODO: Check if these are remote files
    const leftFiles = Object.keys(copyConfig);
    if (leftFiles.length) {
        console.warn(`Following dependency files were not found: ${leftFiles.join(', ')}`);
    }

    return files;
}
