import appRootPath from "app-root-path";
import chalk from "chalk";
import { exec as e, spawn } from "child_process";
import consola, { LogLevel } from "consola";
import fs from "fs-extra";
import https, { RequestOptions } from "https";
import { prompt } from "inquirer";
import path from "path";
import git from "simple-git";
import { promisify } from "util";
import { Spinner } from "cli-spinner";

export { LogLevel } from "consola";
export interface Config {
    repository: string;
    branch?: string;
    token?: string;
    tempLocation: string;
    ignoreFiles?: string[];
    executeOnComplete?: string;
    exitOnComplete?: boolean;
    test?: boolean;
    logLevel?: LogLevel;
    backup?: boolean;
    prompt?: boolean;
}
export interface VersionResults {
    upToDate: boolean;
    currentVersion: string;
    remoteVersion?: string;
}

const cloneSubdirectory = "/gitupdate/repo/";
const backupSubdirectory = "/gitupdate/backup/";
const exec = promisify(e);

export default class AutoUpdater {
    config: Config;
    testing: boolean;
    spinner: Spinner;
    constructor(updateConfig: Config) {
        if (!updateConfig) throw new Error("You must pass a config object to AutoGitUpdate.");
        if (!updateConfig.repository) throw new Error("You must include a repository link.");
        if (!updateConfig.branch) updateConfig.branch = "main";
        if (updateConfig.backup === undefined) updateConfig.backup = true;
        if (!updateConfig.tempLocation)
            throw new Error("You must define a temp location for cloning the repository");

        consola.level =
            typeof updateConfig.logLevel === "undefined" ? LogLevel.Info : updateConfig.logLevel;
        this.testing = Boolean(updateConfig.test);

        if (!this.testing) {
            let file = path.join(appRootPath.path, "package.json");
            let appPackage = JSON.parse(fs.readFileSync(file, "utf-8"));
            if (appPackage.name === "auto-git-update")
                throw new Error(
                    "Updater is not being ran as a dependency & testing is not enabled."
                );
        }

        this.config = updateConfig;
    }

    /**
     * Checks local version against the remote version & then updates if different.
     */
    async autoUpdate() {
        let versionCheck = await this.compareVersions();
        if (versionCheck.upToDate) return true;
        if (this.config.prompt) {
            const res = await prompt<{ update: boolean }>({
                message: `A new version is available (${chalk.gray(
                    versionCheck.remoteVersion
                )}), do you want to update ?`,
                type: "confirm",
                default: true,
                name: "update",
            });
            if (res.update) return await this.forceUpdate();
            else return false;
        } else return await this.forceUpdate();
    }

    async compareVersions(): Promise<VersionResults> {
        try {
            consola.debug("Comparing versions…");
            let currentVersion = this.readAppVersion();
            let remoteVersion = await this.readRemoteVersion();
            consola.debug(`Current version: ${currentVersion}`);
            consola.debug(`Remote Version: ${remoteVersion}`);
            if (currentVersion === remoteVersion) return { upToDate: true, currentVersion };
            return { upToDate: false, currentVersion, remoteVersion };
        } catch (err) {
            consola.error("Error comparing local and remote versions.");
            consola.error(err);
            return { upToDate: false, currentVersion: "Error", remoteVersion: "Error" };
        }
    }
    async forceUpdate(): Promise<boolean> {
        try {
            this.spinner = new Spinner("Installing updated version...")
                .setSpinnerString(9)
                .setSpinnerDelay(30)
                .start();
            consola.debug(`Updating application from ${this.config.repository}`);
            await this.downloadUpdate();
            if (this.config.backup) await this.backupApp();
            await this.installUpdate();
            await this.installDependencies();
            this.spinner.stop(true);
            consola.success("Finished installing updated version.");
            if (this.config.executeOnComplete) {
                await this.promiseBlindExecute(this.config.executeOnComplete);
                consola.debug(`Executed: ${this.config.executeOnComplete}`);
            }
            if (this.config.exitOnComplete) process.exit(1);
            return true;
        } catch (err) {
            consola.error("Error updating application");
            consola.error(err);
            return false;
        }
    }

    private async backupApp() {
        let destination = path.join(this.config.tempLocation, backupSubdirectory);
        consola.debug(`Backing up app to ${destination}`);
        await fs.ensureDir(destination);
        fs.copySync(appRootPath.path, destination);
        return true;
    }

    private async downloadUpdate() {
        let repo = this.config.repository;
        if (this.config.token) {
            repo = repo.replace("http://", "").replace("https://", "");
            repo = `https://${this.config.token}@${repo}`;
        }

        let destination = path.join(this.config.tempLocation, cloneSubdirectory);
        consola.debug(`Cloning ${repo}`);
        consola.debug(`Destination: ${destination}`);
        await fs.ensureDir(destination);
        await fs.emptyDir(destination);
        await this.promiseClone(repo, destination, this.config.branch);
        return true;
    }

    private installDependencies() {
        return new Promise<void>(async (resolve, reject) => {
            let destination = this.testing
                ? path.join(appRootPath.path, "/testing/")
                : appRootPath.path;
            consola.debug(`Installing application dependencies in ${destination}`);

            let npmCommand = `cd ${destination} && npm install`;
            let yarnCommand = `cd ${destination} && yarn install`;
            try {
                const child = await exec(yarnCommand);
                consola.debug(`yarn install: ${child.stdout}`);
                return resolve();
            } catch {}
            try {
                const child = await exec(npmCommand);
                consola.debug(`npm install: ${child.stdout}`);
                resolve();
            } catch (e) {
                consola.error(e);
            }
        });
    }

    private async installUpdate() {
        if (this.config.ignoreFiles) {
            consola.debug("Purging ignored files from the update");
            this.config.ignoreFiles.forEach((file) => {
                file = path.join(this.config.tempLocation, cloneSubdirectory, file);
                consola.debug(`Removing ${file}`);
                fs.unlinkSync(file);
            });
        }

        let source = path.join(this.config.tempLocation, cloneSubdirectory);

        let destination = this.testing
            ? path.join(appRootPath.path, "/testing/")
            : appRootPath.path;
        consola.debug(`Source: ${source}`);
        consola.debug(`Destination: ${destination}`);
        await fs.ensureDir(destination);
        await fs.copy(source, destination);
        return true;
    }

    readAppVersion() {
        let file = path.join(appRootPath.path, "package.json");
        consola.debug(`Reading app version from ${file}`);
        let appPackage = fs.readFileSync(file, "utf-8");
        return JSON.parse(appPackage).version;
    }

    async readRemoteVersion() {
        let options: https.RequestOptions = {};
        let url = this.config.repository + `/${this.config.branch}/package.json`;
        if (url.includes("github")) url = url.replace("github.com", "raw.githubusercontent.com");
        if (this.config.token) options.headers = { Authorization: `token ${this.config.token}` };
        consola.debug(`Reading remote version from ${url}`);

        try {
            let body = (await this.promiseHttpsRequest(url, options)) as any;
            let remotePackage = JSON.parse(body);
            let version = remotePackage.version;
            return version;
        } catch (err) {
            if ((err = 404))
                throw new Error(`This repository requires a token or does not exist. \n ${url}`);
            throw err;
        }
    }

    private promiseClone(repo: string, destination: string, branch: string) {
        return new Promise<void>((resolve, reject) => {
            git().clone(repo, destination, [`--branch=${branch}`], (error) => {
                if (error !== null) reject(`Unable to clone repo \n ${repo} \n ${error}`);
                resolve();
            });
        });
    }

    private promiseBlindExecute(command: string) {
        return new Promise<void>((resolve, reject) => {
            spawn(command, [], { shell: true, detached: true });
            setTimeout(resolve, 1000);
        });
    }

    private promiseHttpsRequest(url: string, options: RequestOptions) {
        return new Promise<string>((resolve, reject) => {
            let req = https.request(url, options, (res) => {
                let body = "";
                res.on("data", (data) => {
                    body += data;
                });
                res.on("end", () => {
                    if (res.statusCode === 200) return resolve(body);
                    consola.error(`Bad Response ${res.statusCode}`);
                    reject(res.statusCode);
                });
            });
            consola.debug(`Sending request to ${url}`);
            consola.debug(`Options: ${JSON.stringify(options)}`);
            req.on("error", reject);
            req.end();
        });
    }
}
