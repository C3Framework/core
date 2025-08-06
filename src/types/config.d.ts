declare enum AddonType {
    behavior = "behavior",
    plugin = "plugin",
}

declare enum AddonTypeNamespace {
    behavior = "Behaviors",
    plugin = "Plugins",
}

type AddonTypeOpts = keyof typeof AddonType;

interface AddonConfigInterface {
    autoGenerate?: boolean;
    autoGenerateTriggers?: boolean;
    instanceName?: string;
    instanceParentName?: string;
    objectTypeName?: string;
    pluginName?: string;
}

type FileConfig = {
    [key: string]:
    | "copy-to-output"
    | "inline-script"
    | "external-dom-script"
    | "external-runtime-script"
    | "external-css";
};

interface AddonConfig extends ProjectAddon {
    addonType: AddonTypeOpts;
    minConstructVersion?: string;
    editorScripts?: string[];
    properties: Property[];
    aceCategories: {
        [key: string]: string;
    };
    interface?: AddonConfigInterface | boolean;
    files?: FileConfig;
    info?: {
        [x: string]: any;
        Set?: {
            CanBeBundled?: boolean;
            IsDeprecated?: boolean;
        };
    };
    /** @deprecated Use `files` instead. */
    fileDependencies?: FileConfig;
}

type ThemeColors = {
    background?: string[] | string;
    pallete?: { [key: string]: string };
};

interface ThemeConfig extends ProjectAddon {
    addonType: "theme";
    colors: ThemeColors;
    variants?: { [key: string]: ThemeColors };
}

interface BehaviorConfig extends AddonConfig {
    addonType: 'behavior';
    /** @default true */
    supportsWorkerMode?: boolean;
    info?: {
        Set?: {
            IsOnlyOneAllowed?: boolean;
            CanBeBundled?: boolean;
            IsDeprecated?: boolean;
        };
    };
}

interface PluginConfig extends AddonConfig {
    addonType: 'plugin';
    type:
    | "object"
    | "world"
    | "dom";
    /** @default true */
    supportsWorkerMode?: boolean;
    wrapperExportProperties?: { [key: string]: Record<string, string> }
    info?: {
        defaultImageUrl?: string;
        Set?: {
            IsResizable?: boolean;
            IsRotatable?: boolean;
            Is3D?: boolean;
            HasImage?: boolean;
            IsTiled?: boolean;
            SupportsZElevation?: boolean;
            SupportsColor?: boolean;
            SupportsEffects?: boolean;
            MustPreDraw?: boolean;
            IsSingleGlobal?: boolean;
            CanBeBundled?: boolean;
            IsDeprecated?: boolean;
            GooglePlayServicesEnabled?: boolean;
        };
        AddCommonACEs?: {
            Position?: boolean;
            SceneGraph?: boolean;
            Size?: boolean;
            Angle?: boolean;
            Appearance?: boolean;
            ZOrder?: boolean;
        };
    };
}

interface BuiltAddonConfig extends AddonConfig {
    typeDefs?: string[];
    Aces?: {
        actions: any;
        expressions: any;
        conditions: any;
    };
    [x: string]: any;
}

interface BuildConfig {
    /**
     * Safely minify the code
     * @default true
     */
    minify?: boolean;
    /**
     * The host domain of the server
     * @default 'http://localhost'
     */
    host?: string;
    /**
     * The port of the server
     * @default 3000
     */
    port?: number;
    /**
     * The path of the main code, such as the addon config, runtime & editor script.
     * @default 'src/'
     */
    sourcePath?: string;
    /**
     * The entry point for compilation. It should be the script that is run on runtime
     * @default 'runtime.ts'
     */
    runtimeScript?: string;
    /**
     * The name of the script where the addon config will be exported
     * @default 'addon.ts'
     */
    addonScript?: string;
    /**
     * The path of the parsed & compiled assets, it will get deleted and recreated on each build
     * @default 'export/'
     */
    exportPath?: string;
    /**
     * The path where the distributed `.c3addon` will get saved to
     * @default 'dist/'
     */
    distPath?: string;
    /**
     * The path that will get scanned for dependencies to ship
     * @default 'src/libs'
     */
    libPath?: string;
    /**
     * The path of the language dictionaries that will get loaded on compilation
     * @default 'src/lang'
     */
    langPath?: string;
    /**
     * The path that will get scanned for TypeScript definition files `.d.ts` to ship
     * @default 'src/'
     */
    defPath?: string;
    /**
     * The path of the `.c3p` examples that will get shipped
     * @default 'examples/'
     */
    examplesPath?: string;
    /**
     * The language that will get shipped by default and that the translated strings will fallback
     * @default 'en-US'
     */
    defaultLang?: string;
    /**
     * The name of the main SCSS file for themes
     * @default 'theme.scss'
     */
    themeStyle?: string;
    /**
     * Convert your autocomplete IDs to MD5 hashes
     * @default false
     */
    autoCompleteHash?: boolean;
    /**
     * Lets you customize the name of your exported `.c3addon`
     * @default '$ID-$SUFFIX-$VERSION'
     */
    exportName?: string;
    /**
     * Enables/configures PostCSS for theme building
     * @default false
     */
    postcss?: {
        plugins?: any[];
    } | boolean;
}
