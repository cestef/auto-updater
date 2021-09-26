# Auto-Updater

Update your nodejs app automatically from a remote git repo by checking the package.json version


## Installing 

```
yarn add https://github.com/cstefFlexin/auto-updater
```
or 
```
npm install cstefFlexin/auto-updater
```


## Using

Here is an example using typescript

```ts
import AutoGitUpdate, { LogLevel } from "auto-updater";

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