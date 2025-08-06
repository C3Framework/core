enum AddonTypeNamespace {
    behavior = "Behaviors",
    plugin = "Plugins",
}


type ExternalAddonID = string;
type VersionConstraint = string;
type DependencyList = Record<ExternalAddonID, VersionConstraint>;


/**
 * Loads a list of plugins, with an specified version constraint.
 *
 * Currently the constraint doesn't work, as Construct doesn't exposes that info.
 */
export async function dependencies<
    T extends Array<IInstance | undefined>,
>(inst: IInstance, list: DependencyList): Promise<readonly [...T, (customMessage?: string) => void | undefined]> {
    const runtime = inst.runtime;
    const id = inst.plugin.id;
    const exportType = inst.runtime.platformInfo.exportType;

    const err = (message: string) => {
        message = `[${id}]: ${message}`;

        if (exportType === 'preview') {
            alert(message);
            throw new Error(message);
        } else {
            console.warn(message);
        }
    }

    const checkForDependencies = () => {
        const objects = Object.values(runtime.objects) as ISDKObjectTypeBase_<IInstance>[];
        const addonsFound = [] as T;
        const allMissing = [];
        const requiredMissing = [];

        for (const addonID in list) {
            const version = list[addonID];
            const isOptional = version.startsWith('?');

            const foundIndex = objects.findIndex((obj) => obj.plugin.id === addonID);

            if (foundIndex >= 0) {
                addonsFound.push(objects[foundIndex].getFirstInstance())
                delete objects[foundIndex];
            } else {
                allMissing.push(addonID);

                if (!isOptional) requiredMissing.push(addonID);

                addonsFound.push(undefined);
            }
        }

        const len = requiredMissing.length;
        if (len) {
            if (len > 1) {
                err('Several addons are required and were not found: ' + requiredMissing.join(', ') + '. Please include them first.');
            } else {
                err('The following addon is required and was not found: ' + requiredMissing[0] + '. Please include it first.');
            }
        }


        let optionalCallback: (customMessage?: string) => void | undefined = undefined;

        if (allMissing.length > requiredMissing.length) {
            optionalCallback = (customMessage: string | undefined = undefined) => {
                const message = customMessage ?? 'Several addons are required and were not found: ' + requiredMissing.join(', ') + '. Please include them first.'
                err(message);
            }
        }


        return [...addonsFound, optionalCallback] as const;
    }

    if (runtime.loadingProgress === 1) {
        return checkForDependencies();
    }

    return new Promise((resolve, value) => {
        runtime.addEventListener('beforeprojectstart', () => {
            resolve(checkForDependencies());
        });
    })
}

/**  @internal */
export function trigger(
    inst: any,
    config: AddonConfig,
    type: Function | string,
) {
    const C3 = globalThis['C3'];

    if (type instanceof Function) {
        type = type.name;
    }

    inst.dispatchEvent(new C3.Event(type));
    inst._trigger(
        C3[
            AddonTypeNamespace[config.addonType]
        ][config.id].Cnds[type],
    );
}

/** @internal */
export function getDebuggerProperties(inst: any, config: AddonConfig) {
    const getDebugProps = inst._debugProperties ?? inst.debugProperties;

    if (!getDebugProps) return [];

    function titleCase(str: string) {
        return str.replace(/(?<=\w)([A-Z])/g, " $1").replace(
            /\w\S*/g,
            function (txt: string) {
                return txt.charAt(0).toUpperCase() +
                    txt.substr(1).toLowerCase();
            },
        );
    }

    const props = getDebugProps();
    return [{
        title: "$" + config.name,
        properties: Object.keys(props)
            .map((prop) => {
                let name = prop;
                let value = props[prop];
                let onedit = () => { };

                if (typeof value === "function") {
                    onedit = value;
                    value = inst[prop] ?? "";

                    if (typeof value === "function") {
                        value = value.call(inst);
                    }
                }

                return {
                    name: titleCase(name),
                    value,
                    onedit,
                };
            }),
    }];
}

export function loop(
    inst: any,
    array: any[],
    callback: (item: any, index: number) => void,
    onEndCallback?: () => void,
) {
    const runtime = inst.runtime;
    const sdk = runtime.sdk;

    const loopCtx = sdk.createLoopingConditionContext();

    for (const [index, item] of array.entries()) {
        callback(item, index);

        loopCtx.retrigger();

        if (loopCtx.isStopped) break;
    }

    if (onEndCallback) {
        onEndCallback();
    }

    loopCtx.release();

    return false;
}
