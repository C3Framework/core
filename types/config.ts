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
    minify?: boolean,
    host?: string,
    port?: number,
    sourcePath?: string,
    addonScript?: string,
    defaultLang?: string,
    runtimeScript?: string,
    langPath?: string,
    libPath?: string,
    defPath?: string,
    exportPath?: string,
    examplesPath?: string,
    distPath?: string,
}