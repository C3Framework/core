import chalk from "chalk";
import windowSize from "window-size";

export function clear() {
    process.stdout.write('\x1Bc');
}

export function pad(str, amount) {
    const padding = "".padStart(amount, " ");

    return padding + str + padding;
}

export function center(value, style = null) {
    // const cols = process.stdout.columns || 100;
    const cols = Math.min(Math.max(windowSize.width, 60), 100);
    const padAmount = Math.floor(cols / 2 - value.length / 2);

    return pad(style ? style(value) : value, padAmount);
}

export function loading(str = '') {
    console.log(center(str, chalk.italic) + "\n");
}

export function header() {
    return center('Alfred Butler', chalk.black.bgYellowBright.bold);
}

export function log(...value) {
    console.log(
        [
            "",
            header(),
            "",
            ...value,
            ""
        ].join("\n")
    );
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