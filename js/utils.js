import { cwd } from 'process';
import fs from 'fs';
import { dirname, join } from 'path';

export function titleCase(str) {
    return str.replace(/(?<=\w)([A-Z])/g, ' $1').replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

export function trimPathSlashes(str = '') {
    return str.trim().replace(/^\.?(\/|\\)|(\\|\/)$/g, '');
}

export function filepath(...paths) {
    paths = join(...paths.map(v => trimPathSlashes(v)));
    let path = join(cwd(), paths);

    // if (os.platform() === 'win32') {
    //     path = pathToFileURL(path)
    // }

    return path;
}

export function fileExtension(filename = '') {
    return filename.trim().match(/(?:\.([^.]+))?$/)[1]?.toLowerCase() ?? null;
}

export function writeFileRecursively(filePath, contents) {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}


export function removeFilesRecursively(dir) {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(function (file) {
            var curPath = join(dir, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // recurse
                removeFilesRecursively(curPath);
            } else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dir);
    }
}

export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}