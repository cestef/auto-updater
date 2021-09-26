import { LogLevel } from "consola";
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
export default class AutoUpdater {
    config: Config;
    testing: boolean;
    spinner: Spinner;
    constructor(updateConfig: Config);
    /**
     * Checks local version against the remote version & then updates if different.
     */
    autoUpdate(): Promise<boolean>;
    compareVersions(): Promise<VersionResults>;
    forceUpdate(): Promise<boolean>;
    private backupApp;
    private downloadUpdate;
    private installDependencies;
    private installUpdate;
    readAppVersion(): any;
    readRemoteVersion(): Promise<any>;
    private promiseClone;
    private promiseBlindExecute;
    private promiseHttpsRequest;
}
