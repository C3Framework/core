
<p align="center">
<img src="https://raw.githubusercontent.com/C3Framework/.github/main/assets/banner-core.png" alt="">
</p>

# Custom AST parser, compiler and TypeScript utils

This repository contains the **C3FO** CLI and TypeScript utilities needed for the [C3 Framework](https://github.com/C3Framework/framework).

Since the framework is fully configurable, you can install this package by yourself and setup things manually but using the previously [mentioned starter base](https://github.com/C3Framework/framework) is highly encouraged.

## Installation

You can install this package through NPM using this repo URL:

```
npm install https://github.com/C3Framework/framework
```

## Structure

A normal structure for a project would look something like this:

```
/dist
/examples
├── example.c3p
└── example.png
/export
/src
├── /lang
│   ├── de-DE.json
│   └── es-MX.json
├── /libs
│   ├── mylib.ts
│   └── style.css
├── addon.ts
├── editor.ts
├── icon.svg
├── instance.ts
└── runtime.ts
c3.config.js
tsconfig.json
```

All the paths are customizable creating a `c3.config.js` on the root of the project.

You can check the [starter base](https://github.com/C3Framework/framework) for more information.

## Usage

### Commands

You can run the following to see all the available commands:

```
npx c3fo
```

You can build your project using:

```
npm run build
```

You can run a development server using:

```
npx c3fo build --dev
```

You can generate documentation using:

```
npx c3fo doc
```

### Defining ACEs

The C3 Framework offers a coupled workflow for defining ACEs. You define the configuration of your ACEs by marking your code using **TypeScript decorators**.

To start you must tell to C3FO on what classes your ACEs will be defined, by using the `@AceClass` decorator. After that, you can start coding your logic in a natural way, marking functions and parameters with their respective decorators, and using the [C3 types](https://www.construct.net/en/make-games/manuals/addon-sdk/reference/pluginproperty#internalH1Link0) (such as `combo`, `cmp`, `eventvar`, etc.) automatically loaded from the framework:

```ts
import { AceClass, Behavior, Condition, Param } from "c3-framework";
import Config from "./addon";

const opts = [
  'test',
  'something',
  'another',
];

@AceClass()
class Instance extends Behavior.Instance(Config) {
  constructor() {
    super();
  }

  @Condition('Is Enabled')
  isEnabled() {
    return true;
  }

  @Condition('Is "{0}" Something')
  isSomething(
    @Param({
      items: [
        { test: 'Test' },
        { something: 'Something' },
        { another: 'Another' },
      ],
    })
    tag: combo // Notice that the Construct types are available to use on TypeScript
    // tag: Cnd.combo // You can also access them through the `Cnd` or `Act` namespaces
  ) {
    return opts[tag] == 'something';
  }
}

export default Instance;
```

## Default build config

This is the default `c3.config.js` configuration loaded:

```js
/** @type {import("c3-framework").BuildConfig} */
export default {
    minify: true,
    host: 'http://localhost',
    port: 3000,
    sourcePath: 'src/',
    runtimeScript: 'runtime.ts',
    addonScript: 'addon.ts',
    exportPath: 'export/',
    distPath: 'dist/',
    libPath: 'src/libs',
    langPath: 'src/lang',
    defPath: 'src/',
    examplesPath: 'examples/',
    defaultLang: 'en-US',
}
```

## Credits

Thanks to [Skymen](https://github.com/skymen) and the [ConstructFund](https://github.com/ConstructFund) for the efforts on making the [C3IDE2](https://github.com/ConstructFund/c3ide2-framework), project that originated this framework.
