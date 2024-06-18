import mime from 'mime';
import { BuiltAddonConfig } from './types/config';

export * from './types/decorators';
export * from './types/config';

export namespace Utils {
    const camelCasedMap = new Map();
    export function camel(str: string) {
        if (camelCasedMap.has(str)) return camelCasedMap.get(str);

        const cleanedStr = str.replace(/[^a-zA-Z0-9$_]/g, " ");
        let words = cleanedStr.split(" ").filter(Boolean);
        for (let i = 1; i < words.length; i++) {
            words[i] = words[i].charAt(0).toUpperCase() + words[i].substring(1);
        }

        let result = words.join("");

        // If the first character is a number, prepend an underscore
        if (!isNaN(parseInt(result.charAt(0)))) {
            result = "_" + result;
        }

        camelCasedMap.set(str, result);

        return result;
    }
}

export namespace Behavior {
    export function Base(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorBase {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        }
    }

    export function Type(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorTypeBase {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        }
    };

    export function Instance(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorInstanceBase {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        }
    };

    export namespace Editor {
        export function Base(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            return class extends SDK.IBehaviorBase {
                constructor() {
                    super(config.id);
                    registerEditorClass(this, SDK, config);
                }
            };
        }

        export function Type(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            return class extends SDK.IBehaviorTypeBase {
                constructor(sdkPlugin: any, iObjectType: any) {
                    super(sdkPlugin, iObjectType);
                }
            };
        }

        export function Instance(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            return class extends SDK.IBehaviorInstanceBase {
                constructor(sdkType: any, inst: any) {
                    super(sdkType, inst);
                }

                Release() { }

                OnCreate() { }

                OnPropertyChanged(id: any, value: any) { }

                LoadC2Property(name: any, valueString: any) {
                    return false; // not handled
                }
            };
        }
    }
}

interface InitAddonOpts {
    Base?: any;
    Type?: any;
    Instance?: any;
}

type C3AddonBase = any;

export function registerEditorClass(inst: any, SDK: any, config: BuiltAddonConfig) {
    const types = {
        behavior: 'behaviors',
        plugin: 'plugins',
    } as any;
    const addonType = types[config.addonType];

    if (!addonType) throw new Error("Unexpected addon type trying to be registered");

    const info = inst._info;

    SDK.Lang.PushContext(addonType + "." + config.id.toLowerCase());

    info.SetName(self.lang(".name"));
    info.SetDescription(self.lang(".description"));
    info.SetCategory(config.category);
    info.SetAuthor(config.author);
    info.SetHelpUrl(self.lang(".help-url"));

    if (config.icon) {
        info.SetIcon(
            config.icon,
            config.icon.endsWith(".svg") ? "image/svg+xml" : "image/png"
        );
    }

    if (config.fileDependencies) {
        Object.keys(config.fileDependencies).forEach((filename: any) => {
            const type = config.fileDependencies[filename];
            const dependency = {
                filename,
                type
            } as any;

            if (type === 'copy-to-output') {
                dependency.fileType = mime.getType(filename);
            }

            info.AddFileDependency(dependency);
        });
    }

    if (config.typeDefs) {
        info.SetTypeScriptDefinitionFiles(config.typeDefs);
    }

    if (config.info && config.info.Set) {
        Object.keys(config.info.Set).forEach((key) => {
            // @ts-ignore
            const value = config.info.Set[key];
            const fn = info[`Set${key}`];
            if (fn && value !== null && value !== undefined)
                fn.call(info, value);
        });
    }

    SDK.Lang.PushContext(".properties");

    info.SetProperties(
        (config.properties || []).map(
            (prop: any) => new SDK.PluginProperty(prop.type, prop.id, prop.options)
        )
    );

    SDK.Lang.PopContext(); // .properties
    SDK.Lang.PopContext();
}

/**
 * @see `initBehavior()`
 * @see `initPlugin()`
 */
export function injectAces(addonBase: C3AddonBase & { [key: string]: any }, config: BuiltAddonConfig) {
    addonBase.Acts = {};
    addonBase.Cnds = {};
    addonBase.Exps = {};

    const aces = config.Aces!;

    Object.keys(aces.actions).forEach((key) => {
        const ace = aces.actions[key];
        addonBase.Acts[Utils.camel(key)] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });

    Object.keys(aces.conditions).forEach((key) => {
        const ace = aces.conditions[key];

        addonBase.Cnds[Utils.camel(key)] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });

    Object.keys(aces.expressions).forEach((key) => {
        const ace = aces.expressions[key];
        addonBase.Exps[Utils.camel(key)] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });
}

/**
 * Automatically sets the Addon base, type and instance classes depending your configuration
 * 
 * You can choose to manually set the classes, just copy this method as example.
 * 
 * @param {BuiltAddonConfig} config
 */
export function initRuntime(config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const C3 = globalThis.C3;

    switch (config.addonType) {
        case 'behavior':
            return initBehavior(C3, config, opts);
        // case 'plugin':
        //     return initPlugin(C3, config, opts);
        default:
            throw new Error("Unexpected addon type trying to be initialized");
    }
}

export function initEditor(config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const SDK = self.SDK;

    switch (config.addonType) {
        case 'behavior':
            return initBehaviorEditor(SDK, config, opts);
        // case 'plugin':
        //     return initPluginEditor(SDK, config, opts);
        default:
            throw new Error("Unexpected addon type trying to be initialized");
    }
}

// export function initPlugin(C3: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
//     const A_C = C3.Plugins[config.id] = opts?.Base ?? Plugin.Base(config);

//     A_C.Type = opts?.Type ?? Plugin.Type(config);

//     A_C.Instance = opts?.Instance ?? Plugin.Instance(config);

//     injectAces(A_C, config)

//     return A_C;
// }

// export function initPluginEditor(SDK: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
//     const A_C = SDK.Plugins[config.id] = opts?.Base ?? Plugin.Editor.Base(config);

//     A_C.Register(config.id, A_C);

//     A_C.Type = opts?.Type ?? Plugin.Editor.Type(config);

//     A_C.Instance = opts?.Instance ?? Plugin.Editor.Instance(config);

//     return A_C;
// }

export function initBehavior(C3: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const A_C = C3.Behaviors[config.id] = opts?.Base ?? Behavior.Base(config);

    A_C.Type = opts?.Type ?? Behavior.Type(config);

    A_C.Instance = opts?.Instance ?? Behavior.Instance(config);

    injectAces(A_C, config)

    return A_C;
}

export function initBehaviorEditor(SDK: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const A_C = SDK.Behaviors[config.id] = opts?.Base ?? Behavior.Editor.Base(config);

    A_C.Register(config.id, A_C);

    A_C.Type = opts?.Type ?? Behavior.Editor.Type(config);

    A_C.Instance = opts?.Instance ?? Behavior.Editor.Instance(config);

    return A_C;
}

/*
 * Global
 */

declare global {
    interface Window {
        [any: string]: any;
    }

    type combo = number;
    type cmp = string;
    type objectname = string;
    type layer = string;
    type layout = string;
    type keyb = string;
    type instancevar = string;
    type instancevarbool = string;
    type eventvar = string;
    type eventvarbool = string;
    type animation = string;
    type objinstancevar = string;
    type float = number;
    type percent = string;
    type color = string;

    namespace Cnd {
        type combo = globalThis.combo;
        type cmp = globalThis.cmp;
        type objectname = globalThis.objectname;
        type layer = globalThis.layer;
        type layout = globalThis.layout;
        type keyb = globalThis.keyb;
        type instancevar = globalThis.instancevar;
        type instancevarbool = globalThis.instancevarbool;
        type eventvar = globalThis.eventvar;
        type eventvarbool = globalThis.eventvarbool;
        type animation = globalThis.animation;
        type objinstancevar = globalThis.objinstancevar;
    }

    namespace Act {
        type combo = globalThis.combo;
        type cmp = globalThis.cmp;
        type objectname = globalThis.objectname;
        type layer = globalThis.layer;
        type layout = globalThis.layout;
        type keyb = globalThis.keyb;
        type instancevar = globalThis.instancevar;
        type instancevarbool = globalThis.instancevarbool;
        type eventvar = globalThis.eventvar;
        type eventvarbool = globalThis.eventvarbool;
        type animation = globalThis.animation;
        type objinstancevar = globalThis.objinstancevar;
    }

    namespace Effect {
        type float = globalThis.float;
        type percent = globalThis.percent;
        type color = globalThis.color;
    }

    var SDK: any;
    var C3: any;
    var ISDKPluginBase: any;
    var ISDKObjectTypeBase: any;
    var ISDKInstanceBase: any;
    var ISDKWorldInstanceBase: any;
    var ISDKDOMPluginBase: any;
    var ISDKDOMInstanceBase: any;
    var ISDKBehaviorBase: any;
    var ISDKBehaviorTypeBase: any;
    var ISDKBehaviorInstanceBase: any;
}