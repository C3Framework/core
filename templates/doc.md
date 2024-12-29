<img src="{{$icon}}" width="100" /><br>

# {{$name}} 

{{$description}}

Author: {{$author}} <br>
Website: [{{$website}}]({{$website}}) <br>
Addon Url: [{{$addonUrl}}]({{$addonUrl}}) <br>
Download Latest Version : [Version: {{$version}}]({{$githubUrl}}/releases/latest) <br>

<br>

<sub>

Made using [c3-framework]({{$frameworkUrl}}) 

</sub>

## Table of Contents

- [Usage](#usage)
- [Examples Files](#examples-files)
- [Properties](#properties)
- [Actions](#actions)
- [Conditions](#conditions)
- [Expressions](#expressions)

---

## Usage

First you must install the dependencies via NPM using:

```
npm install
```

To build the addon, run the following command:

```
npx c3fo build
```

To start the dev server, run:

```
npx c3fo build -D
```

The build uses the `{{$addonScript}}` file for the configurations and the `{{$runtimeScript}}` file as the entry point to generate everything else.
The files defined with `@AceClass` contain all the Actions, Conditions and Expressions logic and configuration, you may want to check them. 

## Examples Files

{{$examples}}

---

## Properties

| Property Name | Description | Type |
| --- | --- | --- |
{{$properties}}

---

## Actions

| Action | Description | Params |
| --- | --- | --- |
{{$actions}}

---
## Conditions

| Condition | Description | Params |
| --- | --- | --- |
{{$conditions}}

---
## Expressions

| Expression | Description | Return Type | Params |
| --- | --- | --- | --- |
{{$expressions}}
