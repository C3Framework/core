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
    items?: KeyValue[];
    itemGroups?: { [id: string]: { '$'?: string } & KeyValue };
    allowedPluginIds?: string[];
    autocompleteId?: string | true;
    filter?: string;
}

interface ITriggerSimple extends ICondition {
    id: string,
    category: string
}

interface IAceClass {
    // modules?: Array<InstanceClasses | (new (...args: any[]) => any)>
    triggers?: Array<ITriggerSimple | string>,
    // middlewares?: Array<Function>,
}

// interface IModule {
//     category: string;
// }
