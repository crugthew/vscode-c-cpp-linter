import * as vscode from "vscode";

export const INTERNAL_NAME: string = "c-cpp-linter";
export const DISPLAY_NAME: string = "C/C++ Linter";

enum OptionCategory {
    compiler = "compiler",
    clangTidy = "clangTidy",
    cppCheck = "cppCheck",
    general = "general"
}

export enum CompilerOption {
    enabled = "enabled",
    path = "path",
    compilationStateFlag = "compilationStateFlag",
    additionalFlags = "additionalFlags",
    parsingRegex = "parsingRegex",
    diagnosisKeywords = "diagnosisKeywords"
}

export enum ClangTidyOption {
    enabled = "enabled",
    path = "path",
    checks = "checks",
    parsingRegex = "parsingRegex",
    diagnosisKeywords = "diagnosisKeywords"
}

export enum CppCheckOption {
    enabled = "enabled",
    path = "path",
    additionalFlags = "additionalFlags",
    checks = "checks",
    parsingRegex = "parsingRegex",
    diagnosisKeywords = "diagnosisKeywords"
}

export enum GeneralOption {
    buildFolderPath = "buildFolderPath",
    showInformationDialog = "showInformationDialog",
    showOutputFromLinters = "showOutputFromLinters",
    maximumParallelTasks = "maximumParallelTasks",
    sourceFileExtensions = "sourceFileExtensions",
    ignoredPaths = "ignoredPaths",
    runOnOpen = "runOnOpen",
    runOnSave = "runOnSave"
}

function getOption<T, V>(category: OptionCategory, option: T): V {
    const value = vscode.workspace.getConfiguration(INTERNAL_NAME).get<V>(`${category}.${option}`);
    if (value === undefined) {
        throw new Error(`Invalid option requested. Category: ${String(category)}, Option: ${String(option)}`);
    }
    return value;
}

export function getCompilerOption<V>(option: CompilerOption): V {
    return getOption<CompilerOption, V>(OptionCategory.compiler, option);
}

export function getClangTidyOption<V>(option: ClangTidyOption): V {
    return getOption<ClangTidyOption, V>(OptionCategory.clangTidy, option);
}

export function getCppCheckOption<V>(option: CppCheckOption): V {
    return getOption<CppCheckOption, V>(OptionCategory.cppCheck, option);
}

export function getGeneralOption<V>(option: GeneralOption): V {
    return getOption<GeneralOption, V>(OptionCategory.general, option);
}

export function substituteWorkspaceFolder(rawPath: string, workspaceFolder: vscode.Uri): vscode.Uri {
    const variable = "${workspaceFolder}";
    if (rawPath.startsWith(variable)) {
        return vscode.Uri.joinPath(workspaceFolder, rawPath.substr(variable.length, rawPath.length - variable.length));
    }

    return vscode.Uri.file(rawPath);
}

export function getWorkspaceFolder(file: vscode.Uri): vscode.Uri {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
    if (!workspaceFolder) {
        throw new Error(`Can't resolve workspace folder for file: ${file.fsPath}`);
    }

    return workspaceFolder.uri;
}
