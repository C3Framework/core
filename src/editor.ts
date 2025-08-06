interface InitAddonOpts {
    Base?: any;
    Type?: any;
    Instance?: any;
}

enum AddonTypeNamespace {
    behavior = "Behaviors",
    plugin = "Plugins",
}

export function initEditor(config: BuiltAddonConfig, opts?: InitAddonOpts) {
    const SDK = self['SDK'];

    switch (config['addonType']) {
        case 'behavior':
            return initBehaviorEditor(SDK, config, opts);
        case 'plugin':
            return initPluginEditor(SDK, config, opts);
        default:
            throw new Error("Unexpected addon type trying to be initialized");
    }
}

export function initPluginEditor(SDK: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    opts = opts ?? {};

    const A_C = SDK[AddonTypeNamespace.plugin][config['id']] = opts['Base'] ?? EditorPlugin.Base(config);

    A_C['Register'](config['id'], A_C);

    A_C['Type'] = opts['Type'] ?? EditorPlugin.Type(config);

    A_C['Instance'] = opts['Instance'] ?? EditorPlugin.Instance(config);

    return A_C;
}

export function initBehaviorEditor(SDK: any, config: BuiltAddonConfig, opts?: InitAddonOpts) {
    opts = opts ?? {};

    const A_C = SDK[AddonTypeNamespace.behavior][config['id']] = opts['Base'] ?? EditorBehavior.Base(config);

    A_C['Register'](config['id'], A_C);

    A_C['Type'] = opts['Type'] ?? EditorBehavior.Type(config);

    A_C['Instance'] = opts['Instance'] ?? EditorBehavior.Instance(config);

    return A_C;
}

export function registerEditorClass(inst: any, SDK: any, config: BuiltAddonConfig) {
    const addonType = AddonTypeNamespace[config['addonType']]?.toLowerCase();
    const utils = self;

    if (!addonType) throw new Error("Unexpected addon type trying to be registered");

    const addonInfo = inst['_info'];

    SDK['Lang'].PushContext(addonType + "." + config['id'].toLowerCase());

    addonInfo['SetName'](utils['lang'](".name"));
    addonInfo['SetDescription'](utils['lang'](".description"));
    addonInfo['SetCategory'](config['category']);
    addonInfo['SetAuthor'](config['author']);
    addonInfo['SetHelpUrl'](utils['lang'](".help-url"));

    if (config['icon']) {
        addonInfo['SetIcon'](
            config['icon'],
            config['icon'].endsWith(".svg") ? "image/svg+xml" : "image/png"
        );
    }

    const files = {
        ...(config['fileDependencies'] ? config['fileDependencies'] : {}),
        ...config['files'],
    }
    const filesKeys = Object.keys(files);

    if (filesKeys.length) {
        function getMimeType(filename: string): string {
            const mimeTypes: Record<string, string> = {
                'txt': 'text/plain',
                'html': 'text/html',
                'htm': 'text/html',
                'css': 'text/css',
                'js': 'application/javascript',
                'ts': 'application/typescript',
                'json': 'application/json',
                'xml': 'application/xml',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'webp': 'image/webp',
                'ico': 'image/x-icon',
                'pdf': 'application/pdf',
                'zip': 'application/zip',
                'rar': 'application/vnd.rar',
                '7z': 'application/x-7z-compressed',
                'tar': 'application/x-tar',
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'mp4': 'video/mp4',
                'mov': 'video/quicktime',
                'avi': 'video/x-msvideo'
            };

            const ext = filename.split('.').pop()?.toLowerCase();
            return ext && mimeTypes[ext] ? mimeTypes[ext] : 'application/octet-stream';
        }

        filesKeys.forEach((filename: any) => {
            const type = files[filename];
            const dependency = {
                filename,
                type
            } as any;

            if (type === 'copy-to-output') {
                dependency['fileType'] = getMimeType(filename);
            }

            addonInfo['AddFileDependency'](dependency);
        });
    }

    const interfaceOpts = config['interface'] as AddonConfigInterface | false;

    if (interfaceOpts) {
        const scriptInterfaces = {};

        if ((interfaceOpts['autoGenerate'] ?? true) || interfaceOpts['instanceName']) {
            scriptInterfaces['instance'] = interfaceOpts['instanceName'] ?? config['id'];
        }

        if (interfaceOpts['objectTypeName']) {
            scriptInterfaces['objectType'] = interfaceOpts['objectTypeName'];
        }

        if (interfaceOpts['pluginName']) {
            scriptInterfaces['plugin'] = interfaceOpts['pluginName'];
        }

        addonInfo['SetScriptInterfaceNames'](scriptInterfaces);
    }

    if (config['typeDefs']) {
        addonInfo['SetTypeScriptDefinitionFiles'](config['typeDefs']);
    }

    if (config['info']) {
        const infoSetOptions = config['info']['Set'];

        if (infoSetOptions) {
            Object.keys(infoSetOptions).forEach((key) => {
                const value = infoSetOptions[key];
                const fn = addonInfo[`Set${key}`];
                if (fn && value !== null && value !== undefined)
                    fn.call(addonInfo, value);
            });
        }
    }


    SDK['Lang'].PushContext(".properties");

    addonInfo['SetProperties'](
        (config['properties'] || []).map(
            (prop: Property) => new SDK['PluginProperty'](prop.type, prop.id, prop.options)
        )
    );

    SDK['Lang'].PopContext(); // .properties
    SDK['Lang'].PopContext();
}


export const EditorBehavior = {
    Base(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

        return class extends SDK.IBehaviorBase {
            constructor() {
                super(config['id']);
                registerEditorClass(this, SDK, config);
            }
        };
    },

    Type(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

        return class extends SDK.IBehaviorTypeBase {
            constructor(sdkPlugin: any, iObjectType: any) {
                super(sdkPlugin, iObjectType);
            }
        };
    },

    Instance(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

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

export const EditorPlugin = {
    Base(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

        return class extends SDK.IPluginBase {
            constructor() {
                super(config['id']);

                const info = this._info;

                info['SetPluginType'](
                    config['type'] === "object" ? "object" : "world",
                );

                if (config['info'] && config['info']['defaultImageUrl']) {
                    info['SetDefaultImageURL'](
                        'c3runtime/' + config['info']['defaultImageUrl'],
                    );
                }

                if (config['domSideScripts']) {
                    info['SetDOMSideScripts'](
                        config['domSideScripts'].map((s: string) => `c3runtime/${s}`),
                    );
                }

                // TODO: Scan ext.dll and import them automatically
                if (
                    config['extensionScript'] && config['extensionScript']['enabled']
                ) {
                    const targets = config['extensionScript']['targets'] || [];
                    targets.forEach((target: string) => {
                        info['AddFileDependency']({
                            filename:
                                `${config['id']}_${target.toLowerCase()}.ext.dll`,
                            type: "wrapper-extension",
                            // @ts-expect-error
                            platform: `windows-${target.toLowerCase()}`,
                        });
                    });
                }

                if (config['info'] && config['info']['AddCommonACEs']) {
                    Object.keys(config['info']['AddCommonACEs']).forEach(
                        (key) => {
                            if (config['info']['AddCommonACEs'][key]) {
                                info[`AddCommon${key}ACEs`]();
                            }
                        },
                    );
                }

                // Set common stuff
                registerEditorClass(this, SDK, config);
            }
        };
    },

    Type(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

        return class extends SDK.ITypeBase {
            constructor(sdkPlugin: any, iObjectType: any) {
                super(sdkPlugin, iObjectType);
            }
        };
    },

    Instance(config: BuiltAddonConfig) {
        const SDK = self['SDK'];

        const CLASSES = {
            object: SDK['IInstanceBase'],
            world: SDK['IWorldInstanceBase'],
            dom: SDK['IWorldInstanceBase'],
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
