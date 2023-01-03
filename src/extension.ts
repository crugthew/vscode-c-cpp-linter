import * as vscode from "vscode";
import {INTERNAL_NAME, DISPLAY_NAME, GeneralOption, getGeneralOption} from "./configuration";
import {clearDiagnostics, clearAllDiagnostics} from "./diagnostics";
import {run, cancelRun, cancelAllRuns} from "./runner";

function toFileUri(file: vscode.TextDocument): vscode.Uri | null {
    if (file.uri.scheme !== "file") {
        return null;
    }

    if (!["cpp", "c"].includes(file.languageId)) {
        return null;
    }

    const tokens = file.fileName.toLowerCase().split(".");
    const extension = tokens[tokens.length - 1].toLowerCase();
    if (!getGeneralOption<string[]>(GeneralOption.sourceFileExtensions).includes(extension)) {
        return null;
    }

    return file.uri;
}

export function activate(context: vscode.ExtensionContext): void {
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    status.name = DISPLAY_NAME;
    status.show();

    const logger = vscode.window.createOutputChannel(INTERNAL_NAME);
    context.subscriptions.push(logger);

    const diagnosticsCollection = vscode.languages.createDiagnosticCollection();
    context.subscriptions.push(diagnosticsCollection);

    async function _run(file: vscode.TextDocument): Promise<void> {
        const fileUri = toFileUri(file);
        if (!fileUri) {
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
        if (!workspaceFolder) {
            return;
        }

        return await run(fileUri, status, logger, diagnosticsCollection);
    }

    async function _runOnOpen(file: vscode.TextDocument): Promise<void> {
        if (getGeneralOption<boolean>(GeneralOption.runOnOpen)) {
            return await _run(file);
        }
    }

    async function _runOnSave(file: vscode.TextDocument): Promise<void> {
        if (getGeneralOption<boolean>(GeneralOption.runOnSave)) {
            return await _run(file);
        }
    }

    function _clearClosedFile(file: vscode.TextDocument): void {
        const fileUri = toFileUri(file);
        if (!fileUri) {
            return;
        }

        cancelRun(fileUri);
        clearDiagnostics(fileUri, diagnosticsCollection);
    }

    vscode.workspace.onDidOpenTextDocument(_runOnOpen);
    vscode.workspace.onDidSaveTextDocument(_runOnSave);
    vscode.workspace.onDidCloseTextDocument(_clearClosedFile);

    async function _runOnActiveFile(): Promise<void> {
        if (vscode.window.activeTextEditor === undefined) {
            return;
        }

        return await _run(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(vscode.commands.registerCommand(`${INTERNAL_NAME}.run`, _runOnActiveFile));

    function _clearActiveFile(): void {
        if (vscode.window.activeTextEditor === undefined) {
            return;
        }

        const fileUri = toFileUri(vscode.window.activeTextEditor.document);
        if (!fileUri) {
            return;
        }

        cancelRun(fileUri);
        clearDiagnostics(fileUri, diagnosticsCollection);
    }

    function _clearAll(): void {
        cancelAllRuns();
        clearAllDiagnostics(diagnosticsCollection);
    }

    context.subscriptions.push(vscode.commands.registerCommand(`${INTERNAL_NAME}.clearFile`, _clearActiveFile));
    context.subscriptions.push(vscode.commands.registerCommand(`${INTERNAL_NAME}.clearAll`, _clearAll));
}

export function deactivate() {}
