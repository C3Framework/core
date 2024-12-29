import figlet from "figlet";
import windowSize from "window-size";
import * as cli from '../../js/cli.js';
import gradient from "gradient-string";
import chalk from "chalk";
import { Command } from "commander";

/**
 * @param {Command[]} commands 
 */
export default function (commands, version) {
    cli.clear();

    let help = commands.map(
        (v) =>
            `- ${v.name()}` +
            (v.args.join(' ') + ' ') +
            (v.options.length ? '[options] ' : ' ')
    );

    let space = 0;

    help.forEach((line) => {
        space = space < line.length ? line.length : space;
    })

    help = help.map((v, i) => v.padEnd(space + 2, ' ') + commands[i].description());

    help.push('- help [command]'.padEnd(space + 2, ' ') + 'Display help for command');

    cli.multiline(
        gradient.morning(
            figlet.textSync(
                'C3FO',
                {
                    font: "Doom",
                    width: Math.min(Math.max(windowSize.width - 10, 60), 100),
                    whitespaceBreak: true
                }
            )
        ),
        'The CLI for the ' + chalk.green('Construct 3 Framework'),
        '',
        'Version ' + chalk.bgGreenBright.bold("v" + version),
        '',
        chalk.bold('Commands: '),
        ...help
    )
}