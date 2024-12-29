#! /usr/bin/env node

import { Command } from "commander";
import build from "./commands/build.js";
import doc from "./commands/doc.js";
import home from "./commands/home.js";

const program = new Command();
const version = '1.0.0';

program
    .name('C3FO')
    .description('CLI tool for the Construct 3 Framework')
    .version(version)
    .action(() => {
        home(program.commands, version);
    });

program.command('build')
    .description('Builds the project of the current directory')
    .option('-D, --dev', 'Runs a local server for development')
    .option('-H, --host <domain>', 'The host of the local server')
    .option('-P, --port <number>', 'The port of the local server')
    .option('--export', 'Only builds the project without packaging')
    .action((opts) => {
        build(!!opts.dev, { host: opts.host, port: opts.port }, { dist: !opts.export });
    });

program.command('doc')
    .description('Generates the documentation of the project')
    .action((opts) => {
        doc()
    });

program.parse();
