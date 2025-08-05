import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// @ts-ignore
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
    build: {
        lib: {
            entry: './src/index.ts',
            formats: ['es'], // pure ESM package
        },
        rollupOptions: {
            external: [
                ...Object.keys(pkg.dependencies), // don't bundle dependencies
                /^node:.*/, // don't bundle built-in Node.js modules (use protocol imports!)
            ],
        },
        target: 'esnext', // transpile as little as possible
    },
    plugins: [dts({
        copyDtsFiles: true
    })], // emit TS declaration files
})
