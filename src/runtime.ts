import {
    getDebuggerProperties as C3FOGetDebuggerProperties,
    loop as C3FOLoop,
    trigger as C3FOTrigger
} from "./utils/runtime.js";

interface InitAddonOpts {
    Base?: any;
    Type?: any;
    Instance?: any;
}

enum AddonTypeNamespace {
    behavior = "Behaviors",
    plugin = "Plugins",
}

/**
 * Automatically sets the Addon base, type and instance classes depending your configuration
 *
 * You can choose to manually set the classes, just copy this method as example.
 *
 * @param {BuiltAddonConfig} config
 */
export function initRuntime(config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const C3 = globalThis['C3'];

    switch (config['addonType']) {
        case 'behavior':
            return initBehavior(C3, config, opts);
        case 'plugin':
            return initPlugin(C3, config, opts);
        default:
            throw new Error("Unexpected addon type trying to be initialized");
    }
}

export function initPlugin(C3: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    opts = opts ?? {};

    const A_C = C3[AddonTypeNamespace.plugin][config['id']] = opts['Base'] ?? Plugin.Base(config);

    A_C['Type'] = opts['Type'] ?? Plugin.Type(config);

    A_C['Instance'] = opts['Instance'] ?? (config['type'] === 'object' ?
        Plugin.Instance(config, globalThis['ISDKInstanceBase']) :
        Plugin.Instance(config, globalThis['ISDKWorldInstanceBase'])
    );

    injectAces(A_C, config)

    return A_C;
}

export function initBehavior(C3: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    opts = opts ?? {};

    const A_C = C3[AddonTypeNamespace.behavior][config['id']] = opts['Base'] ?? Behavior.Base(config);

    A_C['Type'] = opts['Type'] ?? Behavior.Type(config);

    A_C['Instance'] = opts['Instance'] ?? Behavior.Instance(config);

    injectAces(A_C, config)

    return A_C;
}

type C3AddonBase = any;

/**
 * @see `initBehavior()`
 * @see `initPlugin()`
 */
export function injectAces(addonBase: C3AddonBase & { [key: string]: any }, config: BuiltAddonConfig) {
    addonBase['Acts'] = {};
    addonBase['Cnds'] = {};
    addonBase['Exps'] = {};

    const aces = config['Aces']!;

    Object.keys(aces['actions']).forEach((key) => {
        const ace = aces['actions'][key];

        addonBase['Acts'][key] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });

    Object.keys(aces['conditions']).forEach((key) => {
        const ace = aces['conditions'][key];

        addonBase['Cnds'][key] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });

    Object.keys(aces['expressions']).forEach((key) => {
        const ace = aces['expressions'][key];

        addonBase['Exps'][key] = function (...args: any) {
            return ace(this).call(this, ...args);
        };
    });
}

type C3Instances =
    | ISDKWorldInstanceBase_
    | ISDKInstanceBase_
    | ISDKBehaviorInstanceBase_<ISDKWorldInstanceBase_ | ISDKInstanceBase_>;

export interface IC3FrameworkInstance {
    /**
     * Triggers and dispatches event for scripting API.
     *
     * Shortcut to execute `_trigger()` and  `dispatchEvent()`
     */
    trigger(type: Function | string): void;

    /**
     * Define properties to be read by `_getDebuggerProperties()`.
     *
     * The key should be the name of the property and the value the display text on the debugger
     * @example
     * {
     *   _speed: "properties.speed.name",
     *   _isEnabled: "properties.enabled.name"
     * }
     */
    _debugProperties(): KeyValue;
}

export type InstanceClasses = new (...args: any[]) => InstanceBases;
export type InstanceBases =
    | ISDKInstanceBase_
    | ISDKWorldInstanceBase_
    | ISDKDOMPluginBase_;


export const Behavior = {
    Base(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorBase {
            constructor() {
                super();
            }
        };
    },

    Type(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorTypeBase {
            constructor() {
                super();
            }
        };
    },

    Instance<T extends InstanceClasses>(
        config: BuiltAddonConfig,
    ) {
        return class instance extends globalThis.ISDKBehaviorInstanceBase<T>
            implements IC3FrameworkInstance {
            trigger(type: string | Function): void {
                C3FOTrigger(this, config, type);
            }

            loop(
                array: any[],
                callback: (item: any, index: number) => void,
                onEndCallback?: () => void,
            ) {
                C3FOLoop(this, array, callback, onEndCallback);
            }

            _debugProperties(): KeyValue {
                return {};
            }

            _getDebuggerProperties(): any[] {
                return C3FOGetDebuggerProperties(this as any, config);
            }
        };
    }
}

export const Plugin = {
    Base(config: BuiltAddonConfig) {
        const CLASSES = {
            "object": {
                "instance": globalThis["ISDKInstanceBase"],
                "plugin": globalThis["ISDKPluginBase"],
            },
            "world": {
                "instance": globalThis["ISDKWorldInstanceBase"],
                "plugin": globalThis["ISDKPluginBase"],
            },
            "dom": {
                "instance": globalThis["ISDKDOMInstanceBase"],
                "plugin": globalThis["ISDKDOMPluginBase"],
            },
        };

        return class extends CLASSES[config["type"]].plugin {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        };
    },

    Type(config: BuiltAddonConfig) {
        return class
            extends globalThis.ISDKObjectTypeBase<IWorldInstance | IInstance> {
            constructor() {
                super();
            }
        };
    },

    Instance<T extends InstanceClasses>(
        config: BuiltAddonConfig,
        type: T,
    ) {
        // @ts-ignore
        return class extends type implements IC3FrameworkInstance {
            trigger(type: string | Function): void {
                C3FOTrigger(this as unknown as ISDKInstanceBase_, config, type);
            }

            loop(
                array: any[],
                callback: (item: any, index: number) => void,
                onEndCallback?: () => void,
            ) {
                C3FOLoop(this as unknown as ISDKInstanceBase_, array, callback, onEndCallback);
            }

            _debugProperties(): KeyValue {
                return {};
            }

            _getDebuggerProperties(): any[] {
                return C3FOGetDebuggerProperties(this as unknown as ISDKInstanceBase_, config);
            }
        };
    }
}
