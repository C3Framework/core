import { ADDON_NAMESPACE, registerEditorClass } from "..";
import { AddonConfig, BuiltAddonConfig } from "./config";

module ClassUtils {
    /**  @internal */
    export function _trigger(inst: any, config: AddonConfig, type: Function | string) {
        if (type instanceof Function) {
            type = type.name;
        }

        inst.dispatchEvent(new globalThis.C3.Event(type));
        inst._trigger(globalThis.C3[ADDON_NAMESPACE[config.addonType]][config.id].Cnds[type]);
    }

    /** @internal */
    export function _getDebuggerProperties(inst: any, config: AddonConfig) {
        const prefix = ADDON_NAMESPACE[config.addonType] + "." + config.id.toLocaleLowerCase();
        const props = inst.debugProperties();
        return [{
            title: "$" + config.name,
            properties: Object.keys(props)
                .map((prop) => {
                    if (!inst.hasOwnProperty(prop)) {
                        throw new Error(`Passed unset property '${prop}' to debugProperties(). Does the property '${prop}' really exists?`);
                    }
                    return {
                        name: prefix + '.' + props[prop].replace(/^\./, ''),
                        value: inst[prop],
                        onedit: (v: any) => inst[prop] = v
                    };
                })
        }];
    }

    // TODO: Wait for SDKv2 to implement loops...
    // export function _loop(
    //     inst: C3Instances,
    //     array: any[],
    //     callback: (item: any, index: number) => {},
    //     onEndCallback?: Function) {
    //     // Get necessary references
    //     const runtime = inst.runtime;
    //     const eventSheetManager = runtime.GetEventSheetManager();
    //     const currentEvent = runtime.GetCurrentEvent();
    //     const solModifiers = currentEvent.GetSolModifiers();
    //     const eventStack = runtime.GetEventStack();

    //     // Get current stack frame and push new one
    //     const oldFrame = eventStack.GetCurrentStackFrame();
    //     const newFrame = eventStack.Push(currentEvent);

    //     for (const [index, item] of array.entries()) {
    //         callback(item, index);

    //         // Push a copy of the current SOL
    //         eventSheetManager.PushCopySol(solModifiers);

    //         // Retrigger the current event, running a single loop iteration
    //         currentEvent.Retrigger(oldFrame, newFrame);

    //         // Pop the current SOL
    //         eventSheetManager.PopSol(solModifiers);
    //     }

    //     if (onEndCallback) {
    //         onEndCallback();
    //     }

    //     // Pop the event stack frame
    //     eventStack.Pop();

    //     // Return false since event already executed
    //     return false;
    // }
}

type C3Instances = ISDKWorldInstanceBase_ | ISDKInstanceBase_ | ISDKBehaviorInstanceBase_<ISDKWorldInstanceBase_ | ISDKInstanceBase_>;


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
export type InstanceBases = ISDKInstanceBase_ | ISDKWorldInstanceBase_ | ISDKDOMPluginBase_;

export namespace Behavior {
    export function Base(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorBase {
            constructor() {
                super();
            }
        }
    }

    export function Type(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKBehaviorTypeBase {
            constructor() {
                super();
            }
        }
    };

    export function Instance<T extends InstanceClasses>(config: BuiltAddonConfig) {
        return class instance extends globalThis.ISDKBehaviorInstanceBase<T> implements IC3FrameworkInstance {
            trigger(type: string | Function): void {
                ClassUtils._trigger(this, config, type);
            }

            _debugProperties(): KeyValue {
                return {};
            }

            _getDebuggerProperties(): any[] {
                return ClassUtils._getDebuggerProperties(this, config);
            }
        };
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

export namespace Plugin {
    const CLASSES = {
        object: {
            instance: globalThis.ISDKInstanceBase,
            plugin: globalThis.ISDKPluginBase,
        },
        world: {
            instance: globalThis.ISDKWorldInstanceBase,
            plugin: globalThis.ISDKPluginBase,
        },
        dom: {
            instance: globalThis.ISDKDOMInstanceBase,
            plugin: globalThis.ISDKDOMPluginBase,
        },
    };

    export function Base(config: BuiltAddonConfig) {
        return class extends CLASSES[config.type].plugin {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        }
    }

    export function Type(config: BuiltAddonConfig) {
        return class extends globalThis.ISDKObjectTypeBase<IWorldInstance | IInstance> {
            constructor() {
                super();
            }
        }
    };

    export function Instance<T extends InstanceClasses>(config: BuiltAddonConfig, type: T) {
        // @ts-ignore
        return class extends type implements IC3FrameworkInstance {
            trigger(type: string | Function): void {
                ClassUtils._trigger(this, config, type);
            }

            _debugProperties(): KeyValue {
                return {};
            }

            _getDebuggerProperties(): any[] {
                return ClassUtils._getDebuggerProperties(this, config);
            }
        };
    };

    export namespace Editor {
        export function Base(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            return class extends SDK.IPluginBase {
                constructor() {
                    super(config.id);

                    const info = this._info;

                    info.SetPluginType(
                        config.type === "object" ? "object" : "world"
                    );

                    if (config.info && config.info.defaultImageUrl) {
                        info.SetDefaultImageURL(
                            `c3runtime/${config.info.defaultImageUrl}`
                        );
                    }

                    if (config.domSideScripts) {
                        info.SetDOMSideScripts(
                            config.domSideScripts.map((s) => `c3runtime/${s}`)
                        );
                    }

                    // TODO: Scan ext.dll and import them automatically
                    if (config.extensionScript && config.extensionScript.enabled) {
                        const targets = config.extensionScript.targets || [];
                        targets.forEach((target: string) => {
                            info.AddFileDependency({
                                filename: `${config.id}_${target.toLowerCase()}.ext.dll`,
                                type: "wrapper-extension",
                                platform: `windows-${target.toLowerCase()}`,
                            });
                        });
                    }

                    if (config.info && config.info.AddCommonACEs) {
                        Object.keys(config.info.AddCommonACEs).forEach((key) => {
                            if (config.info!.AddCommonACEs[key]) {
                                info[`AddCommon${key}ACEs`]();
                            }
                        });
                    }

                    // Set common stuff
                    registerEditorClass(this, SDK, config);

                }
            };
        }

        export function Type(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            return class extends SDK.ITypeBase {
                constructor(sdkPlugin: any, iObjectType: any) {
                    super(sdkPlugin, iObjectType);
                }
            };
        }

        export function Instance(config: BuiltAddonConfig) {
            const SDK = self.SDK;

            const CLASSES = {
                object: SDK.IInstanceBase,
                world: SDK.IWorldInstanceBase,
                dom: SDK.IWorldInstanceBase,
            };

            return class extends CLASSES[config.type] {
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