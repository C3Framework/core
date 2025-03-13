export interface Property {
    id: string;
    name: string;
    desc: string;
    type: PluginPropertyType;
    options: PluginPropertyOptions | {
        linkText?: string,
        infoText?: string
    };
}

interface Addon {
    addonType: "behavior" | "plugin" | "effect" | "theme";
    id: string;
    name: string;
    version: string;
    author: string;
    website: string;
    documentation: string;
    description: string;
    icon?: string;
}

export interface ProjectAddon extends Addon {
    category: string;
    addonUrl: string;
    githubUrl?: string;
}