import { registerEditorClass } from "..";
import { BuiltAddonConfig } from "./config";

// Maybe this could be implemented wth a Mixin
function triggerEvent(inst: any, id: string, type: Function | string) {
    if (type instanceof Function) {
        type = type.name;
    }

    inst.dispatchEvent(new globalThis.C3.Event("onHitSolid"));
    inst._trigger(globalThis.C3.Behaviors[id].Cnds[type]);
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

            trigger(type: Function | string) {
                triggerEvent(this, config.id, type);
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
        return class extends globalThis.ISDKObjectTypeBase {
            constructor() {
                super();
            }

            _release() {
                super._release();
            }
        }
    };

    export function Instance(config: BuiltAddonConfig) {
        return class extends CLASSES[config.type].instance {
            constructor() {
                super();
            }

            trigger(type: Function | string) {
                triggerEvent(this, config.id, type)
            }

            _release() {
                super._release();
            }
        }
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