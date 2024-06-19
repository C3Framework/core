#! /usr/bin/env node

import { Command } from "commander";
import build from "./commands/build.js";

const program = new Command();

program
    .name('Alfred Butler')
    .description('CLI tool for the Construct 3 Framework')
    .version('1.0.0');

program.command('build')
    .description('Builds the c3-framework project of the current directory')
    .option('-D, --dev', 'Runs a local server for development')
    .option('-H, --host <domain>', 'The host of the local server')
    .option('-P, --port <number>', 'The port of the local server')
    .action((opts) => {
        build(!!opts.dev, { host: opts.host, port: opts.port });
    });

program.parse();