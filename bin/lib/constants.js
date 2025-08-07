export const DEFAULT_IMPORT_TYPE = 'external-dom-script';;

export const ACE_TYPES = {
    actions: 'Acts',
    conditions: 'Cnds',
    expressions: 'Exps',
};

export const ACE_DECORATORS = {
    Action: 'actions',
    Condition: 'conditions',
    Trigger: 'conditions',
    Expression: 'expressions',
};

export const PARAM_DECORATOR = 'Param';

export const ALL_DECORATORS = [
    'AceClass',
    ...Object.keys(ACE_DECORATORS),
    PARAM_DECORATOR,
];

export const TS_Types = {
    'TSStringKeyword': 'string',
    'TSNumberKeyword': 'number',
    'TSBooleanKeyword': 'boolean',
    'TSAnyAnnotation': 'any',
    'TSObjectKeyword': 'object',
    'comboGrouped': 'combo-grouped',
};

export function aceDict() {
    return Object.keys(ACE_TYPES).reduce((obj, k) => {
        obj[k] = {};
        return obj;
    }, {});
}

export function aceList() {
    return Object.keys(ACE_TYPES).reduce((obj, k) => {
        obj[k] = [];
        return obj;
    }, {});
}

export const PLURAL_ADDON = {
    behavior: 'behaviors',
    plugin: 'plugins',
};
