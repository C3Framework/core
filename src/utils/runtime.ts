enum AddonTypeNamespace {
    behavior = "Behaviors",
    plugin = "Plugins",
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
export function _getDebuggerProperties(inst: any, config: AddonConfig) {
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
