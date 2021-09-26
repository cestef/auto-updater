# Auto-Updater

Update your nodejs app automatically from a remote git repo by checking the package.json version


## Installing 

```
yarn add @cstefflexin/auto-updater
```
or 
```
npm install /@cstefflexin/auto-updater
```


## Using

Typescript
```ts
import AutoGitUpdate, { LogLevel } from "@cstefflexin/auto-updater";

const git = new AutoGitUpdate({
    repository: "https://github.com/cstefFlexin/auto-updater",
    tempLocation: "/Users/cstef/Desktop",
    branch: "main",
    test: true,
    prompt: true,
    logLevel: LogLevel.Info,
});
(async () => {
    await git.autoUpdate();
})();
```

Javascript
```js

const { default: AutoGitUpdate, LogLevel } = require("@cstefflexin/auto-updater");

const git = new AutoGitUpdate({
    repository: "https://github.com/cstefFlexin/auto-updater",
    tempLocation: "/Users/cstef/Desktop",
    branch: "main",
    test: true,
    prompt: true,
    logLevel: LogLevel.Info,
});
(async () => {
    await git.autoUpdate();
})();
```