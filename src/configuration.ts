import * as vscode from "vscode";
import {existsSync, readFileSync, writeFileSync} from "fs";
import {defaultClangTidyConfiguration} from "./defaults";

function substituteWorkspaceFolder(rawPath: string, workspaceFolder: vscode.Uri): vscode.Uri {
    const variable = "${workspaceFolder}";
    if (rawPath.startsWith(variable)) {
        return vscode.Uri.joinPath(workspaceFolder, rawPath.substr(variable.length, rawPath.length - variable.length));
    }

    return vscode.Uri.file(rawPath);
}

function getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(internalName);
}

function getWorkspaceFolderForFile(file: vscode.Uri): vscode.Uri {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
    if (!workspaceFolder) {
        throw new Error(`Can't resolve workspace folder for file: ${file.fsPath}`);
    }

    return workspaceFolder.uri;
}

export const internalName: string = "c-cpp-linter";
export const displayName: string = "C/C++ Linter";

export class SeverityKeywords {
    constructor(errors: string[], warnings: string[], information: string[]) {
        this.errors = errors;
        this.warnings = warnings;
        this.information = information;
    }

    errors: string[];
    warnings: string[];
    information: string[];
}

export function getCompilerEnabled(): boolean {
    const parameter = getConfiguration().get("compilerEnabled") as boolean;
    return parameter;
}

export function getCompilerPath(workspaceFolder: vscode.Uri): vscode.Uri {
    const parameter = getConfiguration().get("compilerPath") as string;
    return substituteWorkspaceFolder(parameter, workspaceFolder);
}

export function getCompilationStageFlag(): string {
    const parameter = getConfiguration().get("compilationStageFlag") as string;
    return parameter;
}

export function getAdditionalCompilationFlags(): string[] {
    const parameter = getConfiguration().get("additionalCompilationFlags") as string[];
    return parameter;
}

export function getCompilerParserExpression(): RegExp {
    const parameter = getConfiguration().get("compilerParserExpression") as RegExp;
    return parameter;
}

export function getCompilerDiagnosticKeywords(): SeverityKeywords {
    const parameter = getConfiguration().get("compilerDiagnosticKeywords") as [][];
    return new SeverityKeywords(parameter[0], parameter[1], parameter[2]);
}

export function getClangTidyEnabled(): boolean {
    const parameter = getConfiguration().get("clangTidyEnabled") as boolean;
    return parameter;
}

export function getClangTidyPath(workspaceFolder: vscode.Uri): vscode.Uri {
    const parameter = getConfiguration().get("clangTidyPath") as string;
    return substituteWorkspaceFolder(parameter, workspaceFolder);
}

export function getClangTidyChecksPath(workspaceFolder: vscode.Uri): vscode.Uri {
    const parameter = getConfiguration().get("clangTidyChecksPath") as string;
    return substituteWorkspaceFolder(parameter, workspaceFolder);
}

export function getClangTidyParserExpression(): RegExp {
    const parameter = getConfiguration().get("clangTidyParserExpression") as RegExp;
    return parameter;
}

export function getClangTidyDiagnosticKeywords(): SeverityKeywords {
    const parameter = getConfiguration().get("clangTidyDiagnosticKeywords") as [][];
    return new SeverityKeywords(parameter[0], parameter[1], parameter[2]);
}

export function getCppCheckEnabled(): boolean {
    const parameter = getConfiguration().get("cppCheckEnabled") as boolean;
    return parameter;
}

export function getCppCheckPath(workspaceFolder: vscode.Uri): vscode.Uri {
    const parameter = getConfiguration().get("cppCheckPath") as string;
    return substituteWorkspaceFolder(parameter, workspaceFolder);
}

export function getAdditionalCppCheckFlags(): string[] {
    const parameter = getConfiguration().get("additionalCppCheckFlags") as string[];
    return parameter;
}

export function getCppCheckChecks(): string[] {
    const parameter = getConfiguration().get("cppCheckChecks") as string[];
    return parameter;
}

export function getCppCheckParserExpression(): RegExp {
    const parameter = getConfiguration().get("cppCheckParserExpression") as RegExp;
    return parameter;
}

export function getCppCheckDiagnosticKeywords(): SeverityKeywords {
    const parameter = getConfiguration().get("cppCheckDiagnosticKeywords") as [][];
    return new SeverityKeywords(parameter[0], parameter[1], parameter[2]);
}

export function getBuildFolderPath(workspaceFolder: vscode.Uri): vscode.Uri {
    const parameter = getConfiguration().get("buildFolderPath") as string;
    return substituteWorkspaceFolder(parameter, workspaceFolder);
}

export function getShowInformationDialog(): boolean {
    const parameter = getConfiguration().get("showInformationDialog") as boolean;
    return parameter;
}

export function getShowOutputFromLinters(): boolean {
    const parameter = getConfiguration().get("showOutputFromLinters") as boolean;
    return parameter;
}

export function getMaximumParallelFilesChecked(): number {
    const parameter = getConfiguration().get("maximumParallelFilesChecked") as number;
    return parameter;
}

export function getSourceFileExtensions(): string[] {
    const parameter = getConfiguration().get("sourceFileExtensions") as string[];
    parameter.forEach((value: string) => {
        value = value.toLowerCase();
    });
    return parameter;
}

export function getIgnoredPaths(): RegExp[] {
    const parameter = getConfiguration().get("ignoredPaths") as RegExp[];
    return parameter;
}

export function getRunOnOpen(): boolean {
    const parameter = getConfiguration().get("runOnOpen") as boolean;
    return parameter;
}

export function getRunOnSave(): boolean {
    const parameter = getConfiguration().get("runOnSave") as boolean;
    return parameter;
}

class Command {
    constructor(file: vscode.Uri, directory: vscode.Uri, command: string[]) {
        this.file = file;
        this.directory = directory;
        this.command = command;
    }

    file: vscode.Uri;
    directory: vscode.Uri;
    command: string[];
}

export class Task {
    constructor(name: string, command: Command) {
        this.name = name;
        this.command = command;
    }

    name: string;
    command: Command;
}

function getCompilationCommandFromConfigurationDatabase(file: vscode.Uri): Command {
    const compileCommandsJsonFile = vscode.Uri.joinPath(getBuildFolderPath(getWorkspaceFolderForFile(file)), "compile_commands.json");
    if (!existsSync(compileCommandsJsonFile.fsPath)) {
        throw new Error(`Could not locate 'compile_commands.json' database in path: ${compileCommandsJsonFile.fsPath}`);
    }

    const valueForFile = JSON.parse(readFileSync(compileCommandsJsonFile.fsPath, "utf8")).filter((value: any) => {
        return (
            value &&
            value.hasOwnProperty("file") &&
            value.hasOwnProperty("directory") &&
            value.hasOwnProperty("command") &&
            vscode.Uri.file(value["file"]).fsPath === file.fsPath
        );
    });
    if (valueForFile.length !== 1) {
        throw Error(`Source file '${file.fsPath}' is not present in 'compile_commands.json' database.`);
    }

    return new Command(
        vscode.Uri.file(valueForFile[0]["file"]),
        valueForFile[0]["directory"],
        valueForFile[0]["command"].split(" ").filter((value: string) => {
            return value.length > 0;
        })
    );
}

export function getCompileTaskForFile(file: vscode.Uri): Task {
    const compiler = getCompilerPath(getWorkspaceFolderForFile(file));
    if (!compiler) {
        throw new Error("Compiler is undefined.");
    }
    if (!existsSync(compiler.fsPath)) {
        throw new Error(`Compiler does not exist in path: ${compiler.fsPath}`);
    }

    const task = new Task(compiler.fsPath, getCompilationCommandFromConfigurationDatabase(file));
    task.command.command.every((value: string, index: number) => {
        if (value[0] === "-") {
            task.command.command = [compiler.fsPath, ...task.command.command.slice(index)];
            return false;
        }
        return true;
    });

    const compilationStageFlag = getCompilationStageFlag();
    if (!compilationStageFlag) {
        throw new Error("Compilation state flag undefined.");
    }

    const compilationStageFlagIndex = task.command.command.indexOf("-c");
    if (-1 === compilationStageFlagIndex) {
        throw new Error("Failed to parse compilation command.");
    }
    task.command.command[compilationStageFlagIndex] = compilationStageFlag;

    getAdditionalCompilationFlags().forEach((value: string) => {
        task.command.command.push(value);
    });

    return task;
}

export function getClangTidyTaskForFile(file: vscode.Uri): Task {
    const clangTidyChecksJsonFile = getClangTidyChecksPath(getWorkspaceFolderForFile(file));
    if (!existsSync(clangTidyChecksJsonFile.fsPath)) {
        writeFileSync(clangTidyChecksJsonFile.fsPath, JSON.stringify(defaultClangTidyConfiguration), "utf8");
    }

    const clangTidyChecksJson = JSON.parse(readFileSync(clangTidyChecksJsonFile.fsPath, "utf8"));
    if (!clangTidyChecksJson.hasOwnProperty("checks")) {
        throw new Error(`Incorrect JSON format for file: ${clangTidyChecksJsonFile.fsPath}`);
    }

    const checks = ["-*"];
    if (clangTidyChecksJson["checks"].hasOwnProperty("enabled")) {
        for (const key of clangTidyChecksJson["checks"]["enabled"]) {
            checks.push(key);
        }
    }
    if (clangTidyChecksJson["checks"].hasOwnProperty("disabled")) {
        for (const key of clangTidyChecksJson["checks"]["disabled"]) {
            checks.push(`-${key}`);
        }
    }

    const linter = getClangTidyPath(getWorkspaceFolderForFile(file));
    if (!linter) {
        throw new Error("Linter is undefined.");
    }
    if (!existsSync(linter.fsPath)) {
        throw new Error(`Linter does not exist in path: ${linter.fsPath}`);
    }

    return new Task(
        linter.fsPath,
        new Command(file, getWorkspaceFolderForFile(file), [
            linter.fsPath,
            "-p",
            getWorkspaceFolderForFile(file).fsPath,
            '-checks="' + checks.join(",") + '"',
            file.fsPath
        ])
    );
}

export function getCppCheckTaskForFile(file: vscode.Uri): Task {
    const linter = getCppCheckPath(getWorkspaceFolderForFile(file));
    if (!linter) {
        throw new Error("Linter is undefined.");
    }
    if (!existsSync(linter.fsPath)) {
        throw new Error(`Linter does not exist in path: ${linter.fsPath}`);
    }

    const command = [linter.fsPath, `--enable=${getCppCheckChecks().join(",")}`];
    getAdditionalCppCheckFlags().forEach((value: string) => {
        command.push(value);
    });
    getCompilationCommandFromConfigurationDatabase(file).command.forEach((value: string) => {
        const tokens = value.split(".");
        if (value.startsWith("-D") || value.startsWith("-I") || getSourceFileExtensions().includes(tokens[tokens.length - 1])) {
            command.push(value);
        }
    });

    return new Task(linter.fsPath, new Command(file, getWorkspaceFolderForFile(file), command));
}
