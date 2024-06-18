import * as C3Ide2 from "c3ide2-types";

export interface AddonConfig extends C3Ide2.ProjectAddon {
    editorScripts?: string[];
    properties: C3Ide2.Property[];
    aceCategories: {
        [key: string]: string;
    };
    fileDependencies: {
        [key: string]: "copy-to-output"
        | "inline-script"
        | "external-dom-script"
        | "external-runtime-script"
        | "external-css"
    },
    typeDefs?: string[],
    info: {
        Set: {
            IsOnlyOneAllowed: boolean;
            CanBeBundled: boolean;
            IsDeprecated: boolean;
        };
    };
}

export interface BuiltAddonConfig extends AddonConfig {
    Aces: {
        actions: any,
        expressions: any,
        conditions: any
    }
};

export interface BuildConfig {
    /** 
     * Safely minify the code 
     * @default true
     */
    minify?: boolean,
    /**
     * The host domain of the server
     * @default 'http://localhost'
     */
    host?: string,
    /**
     * The port of the server
     * @default 3000
     */
    port?: number,
    /**
     * The path of the main code, such as the addon config, runtime & editor script.
     * @default 'src/'
     */
    sourcePath?: string,
    /**
     * The entry point for compilation. It should be the script that is run on runtime
     * @default 'runtime.ts'
     */
    runtimeScript?: string,
    /**
     * The name of the script where the addon config will be exported
     * @default 'addon.ts'
     */
    addonScript?: string,
    /**
     * The path of the parsed & compiled assets, it will get deleted and recreated on each build
     * @default 'export/'
     */
    exportPath?: string,
    /**
     * The path where the distributed `.c3addon` will get saved to
     * @default 'dist/'
     */
    distPath?: string,
    /**
     * The path that will get scanned for dependencies to ship
     * @default 'src/libs'
     */
    libPath?: string,
    /**
     * The path of the language dictionaries that will get loaded on compilation
     * @default 'src/lang'
     */
    langPath?: string,
    /**
     * The path that will get scanned for TypeScript definition files `.d.ts` to ship
     * @default 'src/'
     */
    defPath?: string,
    /**
     * The path of the `.c3p` examples that will get shipped
     * @default 'examples/'
     */
    examplesPath?: string,
    /**
     * The language that will get shipped by default and that the translated strings will fallback
     * @default 'en-US'
     */
    defaultLang?: string,
}