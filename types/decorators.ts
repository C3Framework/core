type C3Type = combo
    | cmp
    | objectname
    | layer
    | layout
    | keyb
    | instancevar
    | instancevarbool
    | eventvar
    | eventvarbool
    | animation
    | objinstancevar
    | float
    | percent
    | color;

interface IAction {
    id?: string;
    listName?: string;
    displayText?: string;
    description?: string;
    category?: string;
    highlight?: boolean;
    deprecated?: boolean;
    isAsync?: boolean;
}

interface ICondition {
    id?: string;
    listName?: string;
    displayText?: string;
    category?: string;
    description?: string;
    highlight?: boolean;
    deprecated?: boolean;
    isTrigger?: boolean;
    isFakeTrigger?: boolean;
    isStatic?: boolean;
    isLooping?: boolean;
    isInvertible?: boolean;
    isCompatibleWithTriggers?: boolean;
}

interface IExpression {
    id?: string;
    listName?: string;
    category?: string;
    description?: string;
    highlight?: boolean;
    deprecated?: boolean;
    isVariadicParameters?: boolean;
    returnType?:
    | "string"
    | "number"
    | "any";
}

interface IParam {
    id?: string;
    name?: string;
    desc?: string;
    type?: string | number | any | C3Type;
    initialValue?: any;
    items?: Array<{ [key: string]: string }>;
    allowedPluginIds?: string[];
    autocompleteId?: string | true;
}

interface ITriggerSimple extends ICondition {
    id: string,
    category: string
}

export interface IAceClass {
    // modules?: Array<InstanceClasses | (new (...args: any[]) => any)>
    triggers?: Array<ITriggerSimple | string>,
    // middlewares?: Array<Function>,
}

// interface IModule {
//     category: string;
// }

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

// export function AceModule(opts: IModule) {
//     return function (target) {

//     }
// }