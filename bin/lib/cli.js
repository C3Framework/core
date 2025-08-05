import chalk from "chalk";
import windowSize from "window-size";

let enabled = true;

export function on() {
    enabled = true;
}

export function off() {
    enabled = false;
}

export function clear() {
    if (!enabled) return;

    process.stdout.write('\x1Bc');
}

export function pad(str, amount) {
    const padding = "".padStart(amount, " ");

    return padding + str + padding;
}

export function center(value, style = null) {
    // const cols = process.stdout.columns || 100;
    const cols = Math.min(Math.max(windowSize?.width ?? 0, 60), 100);
    const padAmount = Math.floor(cols / 2 - value.length / 2);

    return pad(style ? style(value) : value, padAmount);
}

export function loading(str = '') {
    line(str, chalk.italic);
}

export function line(str, style = null) {
    if (!enabled) return;

    console.log(center(str, style) + "\n");
}

export function header() {
    return center('C3FO', chalk.black.bgYellowBright.bold);
}

export function log(...value) {
    if (!enabled) return;
    let msg = [
        "",
        header(),
        "",
    ];

    if (value.length) {
        msg = [...msg, ...value];
    }

    multiline(...msg);
}

export function multiline(...values) {
    if (!enabled) return;

    console.log([...values, ""].join("\n"));
}

export function error(value) {
    let message;

    if (typeof value === typeof '') {
        message = value
    } else {
        message = value.message;
    }

    console.error([
        "",
        header(),
        "",
        chalk.red(chalk.bold("Error" + (value.code ? ` (${value.code}): ` : ': ')) + message),
        "",
        ...(value.stack ? [chalk.red(chalk.bold("Stack: ") + value.stack)] : []),
        ""
    ].join("\n"));
}
