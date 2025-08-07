export * from './runtime.js';
export * from './editor.js';

// * Decorators are purely syntax suggar, they are removed on compilation

/**
 * Action decorator
 */
export function Action(displayTextOrOpts?: string | IAction, opts?: IAction): MethodDecorator {
    return function (target) {
    };
}

/**
 * Expression decorator
 */
export function Expression(opts?: IExpression): MethodDecorator {
    return function (target) {
    };
}

/**
 * Condition decorator
 */
export function Condition(displayTextOrOpts?: string | ICondition, opts?: ICondition): MethodDecorator {
    return function (target) {
    };
}

/**
 * Shortcut for Condition decorator with `isTrigger` as `true`
 */
export function Trigger(opts?: ICondition): MethodDecorator {
    return function (target) {
    };
}

/**
 * ACE Parameter decorator.
 *
 * Use `string`, `number`, `any`,`Cnd.*`, `Act.*`, `Effect.*` for types
 */
export function Param(opts?: IParam): ParameterDecorator {
    return function () {
    }
}

export function AceClass(opts?: IAceClass): ClassDecorator {
    return function (target) {

    }
}

export function Schema(opts?: {}): MethodDecorator {
    return function (target) {

    }
}



declare global {
    type TweenCustomEaseType = any;

    interface Window {
        [any: string]: any;
    }

    // Helper
    type KeyValue = { [key: string]: string };

    type combo = number;
    type cmp = number;
    type objectname = object;
    type layer = ILayer;
    type layout = ILayout;
    type keyb = number;

    /** Careful, this returns an index of the instVar */
    type instancevar = number;
    /** Careful, this returns an index of the instVar */
    type instancevarbool = number;
    /** Careful, this returns an index of the instVar */
    type objinstancevar = number;

    /** This doesn't work at the moment  */
    type eventvar = never;
    /** This doesn't work at the moment  */
    type eventvarbool = never;

    type animation = string;
    type float = number;
    type percent = string;
    type color = string;
    type projectfile = string;
    type comboGrouped = number;

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
        type comboGrouped = globalThis.comboGrouped;
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
        type comboGrouped = globalThis.comboGrouped;
    }

    namespace Effect {
        type float = globalThis.float;
        type percent = globalThis.percent;
        type color = globalThis.color;
    }

    // var SDK: any;
}

