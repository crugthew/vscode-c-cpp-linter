import * as vscode from "vscode";
import {
    displayName,
    SeverityKeywords,
    getCompilerEnabled,
    getCompilerParserExpression,
    getCompilerDiagnosticKeywords,
    getClangTidyEnabled,
    getClangTidyParserExpression,
    getClangTidyDiagnosticKeywords,
    getCppCheckEnabled,
    getCppCheckParserExpression,
    getCppCheckDiagnosticKeywords,
    getMaximumParallelFilesChecked,
    getCompileTaskForFile,
    getClangTidyTaskForFile,
    getCppCheckTaskForFile
} from "./configuration";
import {updateDiagnostics} from "./diagnostics";
import {ReturnedOutput, runCommandOnProcess} from "./processRunner";

export class TaskResult {
    constructor(output: string, parsingExpression: RegExp, severityKeywords: SeverityKeywords) {
        this.output = output;
        this.parsingExpression = parsingExpression;
        this.severityKeywords = severityKeywords;
    }

    output: string;
    parsingExpression: RegExp;
    severityKeywords: SeverityKeywords;
}

let _running: vscode.Uri[] = [];
let _runQueue: vscode.Uri[] = [];

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function showProgress(status: vscode.StatusBarItem, logger: vscode.OutputChannel): void {
    const runCount = _running.length;
    const queueCount = _runQueue.length;

    let tooltip = `${displayName}: idle`;
    let text = "-";

    if (runCount > 0 && queueCount > 0) {
        tooltip = `${displayName}: ${runCount} processes running, ${queueCount} processes in run queue`;
        text = `${_running.length} | ${_runQueue.length}`;

        tooltip += "\n\n Running:";
        for (const file of _running) {
            tooltip += `\n ${file.fsPath}`;
        }
        tooltip += "\n\n Waiting:";
        for (const file of _runQueue) {
            tooltip += `\n ${file.fsPath}`;
        }
    } else if (runCount > 0) {
        tooltip = `${displayName}: ${runCount} processes running`;
        text = `${_running.length}`;

        tooltip += "\n\n Running:";
        for (const file of _running) {
            tooltip += `\n ${file.fsPath}`;
        }
    }

    status.tooltip = tooltip;
    status.text = text;

    if (runCount > 0) {
        logger.appendLine(`> Processes running: ${runCount}`);
    }
    if (queueCount > 0) {
        logger.appendLine(`> Processes in queue: ${queueCount}`);
    }
}

export async function runOnFile(
    file: vscode.Uri,
    status: vscode.StatusBarItem,
    logger: vscode.OutputChannel,
    diagnosticsCollection: vscode.DiagnosticCollection
): Promise<void> {
    if (_running.includes(file)) {
        logger.appendLine(`> Task is already running for file: ${file.fsPath}. Skipping duplicate task...`);
        return;
    } else if (_running.length >= getMaximumParallelFilesChecked()) {
        if (!_runQueue.includes(file)) {
            logger.appendLine(`> Task moved to queue for file: ${file.fsPath}.`);
            _runQueue = [file, ..._runQueue];
            showProgress(status, logger);
        }
        return;
    }

    _running = [file, ..._running];
    showProgress(status, logger);

    let success: boolean = true;
    let result: string[] = ["", "", ""];

    try {
        function empty(): Thenable<string> {
            return new Promise((resolve) => {
                resolve("");
            });
        }

        result = await Promise.all([
            getCompilerEnabled() ? runCommandOnProcess(getCompileTaskForFile(file), ReturnedOutput.ERROR, logger) : empty(),
            getClangTidyEnabled() ? runCommandOnProcess(getClangTidyTaskForFile(file), ReturnedOutput.NORMAL, logger) : empty(),
            getCppCheckEnabled() ? runCommandOnProcess(getCppCheckTaskForFile(file), ReturnedOutput.ERROR, logger) : empty()
        ]);
    } catch (error) {
        success = false;

        const errorMessage = getErrorMessage(error);
        logger.appendLine(`> Something failed with error: ${errorMessage}`);
        vscode.window.showErrorMessage(errorMessage);
    }

    if (_running.includes(file)) {
        _running.splice(_running.indexOf(file), 1);

        if (success) {
            logger.appendLine(`> Tasks completed for file: ${file.fsPath}. Updating diagnostics...`);
            updateDiagnostics(
                file,
                [
                    new TaskResult(result[0], new RegExp(getCompilerParserExpression(), "g"), getCompilerDiagnosticKeywords()),
                    new TaskResult(result[1], new RegExp(getClangTidyParserExpression(), "g"), getClangTidyDiagnosticKeywords()),
                    new TaskResult(result[2], new RegExp(getCppCheckParserExpression(), "g"), getCppCheckDiagnosticKeywords())
                ],
                diagnosticsCollection
            );
        }
    } else {
        logger.appendLine(`> Tasks were was cancelled for file: ${file.fsPath}. Skipping diagnostics update...`);
    }

    showProgress(status, logger);

    if (_runQueue.length > 0) {
        const newFileToCheck = _runQueue[0];
        _runQueue = _runQueue.slice(1);
        showProgress(status, logger);

        await runOnFile(newFileToCheck, status, logger, diagnosticsCollection);
    }
}

export function cancelRun(file: vscode.Uri): void {
    if (_running.includes(file)) {
        _running.splice(_running.indexOf(file), 1);
    }
}

export function cancelAllRuns(): void {
    _running = [];
    _runQueue = [];
}
