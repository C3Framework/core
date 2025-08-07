type C3AddonType = 'behavior'
    | 'plugin'
    | 'effect'
    | 'theme'


interface Addon {
    addonType: C3AddonType;
    id: string;
    name: string;
    version: string;
    author: string;
    website: string;
    documentation: string;
    description: string;
    icon?: string;
}

interface Property {
    id: string;
    name: string;
    desc: string;
    type: PluginPropertyType;
    options: Omit<PluginPropertyOptions, "items"> & {
        linkText?: string,
        infoText?: string,
        items?: { [key: string]: string }
    };
}

interface ProjectAddon extends Addon {
    category: string;
    addonUrl: string;
    githubUrl?: string;
}
