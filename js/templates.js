import { readFileSync } from 'fs';
import { join } from 'path';

export function template(path, opts = {}) {
    path = join(import.meta.dirname, '../templates', path);

    const content = readFileSync(path, { encoding: 'utf-8' });

    let replaced = content;

    for (const key in opts) {
        const value = opts[key];
        const search = `{{$${key}}}`;
        replaced = replaced.replace(search, value);
    }

    return replaced;
}