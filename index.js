"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogLevel = void 0;
const app_root_path_1 = __importDefault(require("app-root-path"));
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const consola_1 = __importStar(require("consola"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const https_1 = __importDefault(require("https"));
const inquirer_1 = require("inquirer");
const path_1 = __importDefault(require("path"));
const simple_git_1 = __importDefault(require("simple-git"));
const util_1 = require("util");
const cli_spinner_1 = require("cli-spinner");
var consola_2 = require("consola");
Object.defineProperty(exports, "LogLevel", { enumerable: true, get: function () { return consola_2.LogLevel; } });
const cloneSubdirectory = "/gitupdate/repo/";
const backupSubdirectory = "/gitupdate/backup/";
const exec = (0, util_1.promisify)(child_process_1.exec);
class AutoUpdater {
    constructor(updateConfig) {
        if (!updateConfig)
            throw new Error("You must pass a config object to AutoGitUpdate.");
        if (!updateConfig.repository)
            throw new Error("You must include a repository link.");
        if (!updateConfig.branch)
            updateConfig.branch = "main";
        if (updateConfig.backup === undefined)
            updateConfig.backup = true;
        if (!updateConfig.tempLocation)
            throw new Error("You must define a temp location for cloning the repository");
        consola_1.default.level =
            typeof updateConfig.logLevel === "undefined" ? consola_1.LogLevel.Info : updateConfig.logLevel;
        this.testing = Boolean(updateConfig.test);
        if (!this.testing) {
            let file = path_1.default.join(app_root_path_1.default.path, "package.json");
            let appPackage = JSON.parse(fs_extra_1.default.readFileSync(file, "utf-8"));
            if (appPackage.name === "auto-git-update")
                throw new Error("Updater is not being ran as a dependency & testing is not enabled.");
        }
        this.config = updateConfig;
    }
    /**
     * Checks local version against the remote version & then updates if different.
     */
    async autoUpdate() {
        let versionCheck = await this.compareVersions();
        if (versionCheck.upToDate)
            return true;
        if (this.config.prompt) {
            const res = await (0, inquirer_1.prompt)({
                message: `A new version is available (${chalk_1.default.gray(versionCheck.remoteVersion)}), do you want to update ?`,
                type: "confirm",
                default: true,
                name: "update",
            });
            if (res.update)
                return await this.forceUpdate();
            else
                return false;
        }
        else
            return await this.forceUpdate();
    }
    async compareVersions() {
        try {
            consola_1.default.debug("Comparing versions…");
            let currentVersion = this.readAppVersion();
            let remoteVersion = await this.readRemoteVersion();
            consola_1.default.debug(`Current version: ${currentVersion}`);
            consola_1.default.debug(`Remote Version: ${remoteVersion}`);
            if (currentVersion === remoteVersion)
                return { upToDate: true, currentVersion };
            return { upToDate: false, currentVersion, remoteVersion };
        }
        catch (err) {
            consola_1.default.error("Error comparing local and remote versions.");
            consola_1.default.error(err);
            return { upToDate: false, currentVersion: "Error", remoteVersion: "Error" };
        }
    }
    async forceUpdate() {
        try {
            this.spinner = new cli_spinner_1.Spinner("Installing updated version...")
                .setSpinnerString(9)
                .setSpinnerDelay(30)
                .start();
            consola_1.default.debug(`Updating application from ${this.config.repository}`);
            await this.downloadUpdate();
            if (this.config.backup)
                await this.backupApp();
            await this.installUpdate();
            await this.installDependencies();
            this.spinner.stop(true);
            consola_1.default.success("Finished installing updated version.");
            if (this.config.executeOnComplete) {
                await this.promiseBlindExecute(this.config.executeOnComplete);
                consola_1.default.debug(`Executed: ${this.config.executeOnComplete}`);
            }
            if (this.config.exitOnComplete)
                process.exit(1);
            return true;
        }
        catch (err) {
            consola_1.default.error("Error updating application");
            consola_1.default.error(err);
            return false;
        }
    }
    async backupApp() {
        let destination = path_1.default.join(this.config.tempLocation, backupSubdirectory);
        consola_1.default.debug(`Backing up app to ${destination}`);
        await fs_extra_1.default.ensureDir(destination);
        fs_extra_1.default.copySync(app_root_path_1.default.path, destination);
        return true;
    }
    async downloadUpdate() {
        let repo = this.config.repository;
        if (this.config.token) {
            repo = repo.replace("http://", "").replace("https://", "");
            repo = `https://${this.config.token}@${repo}`;
        }
        let destination = path_1.default.join(this.config.tempLocation, cloneSubdirectory);
        consola_1.default.debug(`Cloning ${repo}`);
        consola_1.default.debug(`Destination: ${destination}`);
        await fs_extra_1.default.ensureDir(destination);
        await fs_extra_1.default.emptyDir(destination);
        await this.promiseClone(repo, destination, this.config.branch);
        return true;
    }
    installDependencies() {
        return new Promise(async (resolve, reject) => {
            let destination = this.testing
                ? path_1.default.join(app_root_path_1.default.path, "/testing/")
                : app_root_path_1.default.path;
            consola_1.default.debug(`Installing application dependencies in ${destination}`);
            let npmCommand = `cd ${destination} && npm install`;
            let yarnCommand = `cd ${destination} && yarn install`;
            try {
                const child = await exec(yarnCommand);
                consola_1.default.debug(`yarn install: ${child.stdout}`);
                return resolve();
            }
            catch { }
            try {
                const child = await exec(npmCommand);
                consola_1.default.debug(`npm install: ${child.stdout}`);
                resolve();
            }
            catch (e) {
                consola_1.default.error(e);
            }
        });
    }
    async installUpdate() {
        if (this.config.ignoreFiles) {
            consola_1.default.debug("Purging ignored files from the update");
            this.config.ignoreFiles.forEach((file) => {
                file = path_1.default.join(this.config.tempLocation, cloneSubdirectory, file);
                consola_1.default.debug(`Removing ${file}`);
                fs_extra_1.default.unlinkSync(file);
            });
        }
        let source = path_1.default.join(this.config.tempLocation, cloneSubdirectory);
        let destination = this.testing
            ? path_1.default.join(app_root_path_1.default.path, "/testing/")
            : app_root_path_1.default.path;
        consola_1.default.debug(`Source: ${source}`);
        consola_1.default.debug(`Destination: ${destination}`);
        await fs_extra_1.default.ensureDir(destination);
        await fs_extra_1.default.copy(source, destination);
        return true;
    }
    readAppVersion() {
        let file = path_1.default.join(app_root_path_1.default.path, "package.json");
        consola_1.default.debug(`Reading app version from ${file}`);
        let appPackage = fs_extra_1.default.readFileSync(file, "utf-8");
        return JSON.parse(appPackage).version;
    }
    async readRemoteVersion() {
        let options = {};
        let url = this.config.repository + `/${this.config.branch}/package.json`;
        if (url.includes("github"))
            url = url.replace("github.com", "raw.githubusercontent.com");
        if (this.config.token)
            options.headers = { Authorization: `token ${this.config.token}` };
        consola_1.default.debug(`Reading remote version from ${url}`);
        try {
            let body = (await this.promiseHttpsRequest(url, options));
            let remotePackage = JSON.parse(body);
            let version = remotePackage.version;
            return version;
        }
        catch (err) {
            if ((err = 404))
                throw new Error(`This repository requires a token or does not exist. \n ${url}`);
            throw err;
        }
    }
    promiseClone(repo, destination, branch) {
        return new Promise((resolve, reject) => {
            (0, simple_git_1.default)().clone(repo, destination, [`--branch=${branch}`], (error) => {
                if (error !== null)
                    reject(`Unable to clone repo \n ${repo} \n ${error}`);
                resolve();
            });
        });
    }
    promiseBlindExecute(command) {
        return new Promise((resolve, reject) => {
            (0, child_process_1.spawn)(command, [], { shell: true, detached: true });
            setTimeout(resolve, 1000);
        });
    }
    promiseHttpsRequest(url, options) {
        return new Promise((resolve, reject) => {
            let req = https_1.default.request(url, options, (res) => {
                let body = "";
                res.on("data", (data) => {
                    body += data;
                });
                res.on("end", () => {
                    if (res.statusCode === 200)
                        return resolve(body);
                    consola_1.default.error(`Bad Response ${res.statusCode}`);
                    reject(res.statusCode);
                });
            });
            consola_1.default.debug(`Sending request to ${url}`);
            consola_1.default.debug(`Options: ${JSON.stringify(options)}`);
            req.on("error", reject);
            req.end();
        });
    }
}
exports.default = AutoUpdater;
