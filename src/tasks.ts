import * as vscode from "vscode";
import {existsSync, readFileSync} from "fs";
import {
    CompilerOption,
    ClangTidyOption,
    CppCheckOption,
    GeneralOption,
    getCompilerOption,
    getClangTidyOption,
    getCppCheckOption,
    getGeneralOption,
    substituteWorkspaceFolder,
    getWorkspaceFolder
} from "./configuration";

class Command {
    constructor(readonly file: vscode.Uri, readonly directory: vscode.Uri, readonly command: string[]) {
        this.file = file;
        this.directory = directory;
        this.command = command;
    }
}

export class Task {
    constructor(readonly name: string, readonly command: Command) {
        this.name = name;
        this.command = command;
    }
}

function getCompilationCommand(file: vscode.Uri): string[] {
    const compileCommandsJsonFile = vscode.Uri.joinPath(
        substituteWorkspaceFolder(getGeneralOption(GeneralOption.buildFolderPath), getWorkspaceFolder(file)),
        "compile_commands.json"
    );
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
    if (valueForFile.length === 0) {
        throw Error(`Source file '${file.fsPath}' is not present in 'compile_commands.json' database.`);
    }

    return valueForFile[0]["command"].split(" ").filter((value: string) => {
        return value.length > 0;
    });
}

export function getCompileTask(file: vscode.Uri): Task {
    const name = "'compiler'";
    const compiler = substituteWorkspaceFolder(getCompilerOption<string>(CompilerOption.path), getWorkspaceFolder(file));
    if (!compiler) {
        throw new Error(`${name} is undefined.`);
    }
    if (!existsSync(compiler.fsPath)) {
        throw new Error(`${name} does not exist in path: ${compiler.fsPath}`);
    }

    let command = getCompilationCommand(file);
    command.every((value: string) => {
        if (value[0] === "-") {
            command.unshift(compiler.fsPath);
            return false;
        }
        return true;
    });

    const compilationStateFlag = getCompilerOption<string>(CompilerOption.compilationStateFlag);
    if (!compilationStateFlag) {
        throw new Error("Compilation state flag undefined.");
    }
    const compilationStageFlagIndex = command.indexOf("-c");
    if (compilationStageFlagIndex === -1) {
        throw new Error("Failed to parse compilation command.");
    }

    command[compilationStageFlagIndex] = compilationStateFlag;
    return new Task(
        compiler.fsPath,
        new Command(file, getWorkspaceFolder(file), command.concat(getCompilerOption<string[]>(CompilerOption.additionalFlags)))
    );
}

export function getClangTidyTask(file: vscode.Uri): Task {
    const name = "'clang-tidy'";
    const linter = substituteWorkspaceFolder(getClangTidyOption<string>(ClangTidyOption.path), getWorkspaceFolder(file));
    if (!linter) {
        throw new Error(`${name} is undefined.`);
    }
    if (!existsSync(linter.fsPath)) {
        throw new Error(`${name} does not exist in path: ${linter.fsPath}`);
    }

    const clangTidyChecksJson = getClangTidyOption<any>(ClangTidyOption.checks);
    if (!clangTidyChecksJson.hasOwnProperty("enabled") || !clangTidyChecksJson.hasOwnProperty("disabled")) {
        throw new Error(`Incorrect format for ${name} checks.`);
    }

    const checks = ["-*"].concat(clangTidyChecksJson["enabled"]);
    for (const key of clangTidyChecksJson["disabled"]) {
        checks.push(`-${key}`);
    }

    return new Task(
        linter.fsPath,
        new Command(file, getWorkspaceFolder(file), [
            linter.fsPath,
            "-p",
            getWorkspaceFolder(file).fsPath,
            '-checks="' + checks.join(",") + '"',
            file.fsPath
        ])
    );
}

export function getCppCheckTask(file: vscode.Uri): Task {
    const name = "'cppcheck'";
    const linter = substituteWorkspaceFolder(getCppCheckOption<string>(CppCheckOption.path), getWorkspaceFolder(file));
    if (!linter) {
        throw new Error(`${name} is undefined.`);
    }
    if (!existsSync(linter.fsPath)) {
        throw new Error(`${name} does not exist in path: ${linter.fsPath}`);
    }

    const command = [linter.fsPath, `--enable=${getCppCheckOption<string[]>(CppCheckOption.checks).join(",")}`].concat(
        getCppCheckOption<string[]>(CppCheckOption.additionalFlags)
    );
    getCompilationCommand(file).forEach((value: string) => {
        const tokens = value.split(".");
        if (
            value.startsWith("-D") ||
            value.startsWith("-I") ||
            getGeneralOption<string[]>(GeneralOption.sourceFileExtensions).includes(tokens[tokens.length - 1])
        ) {
            command.push(value);
        }
    });

    return new Task(linter.fsPath, new Command(file, getWorkspaceFolder(file), command));
}
