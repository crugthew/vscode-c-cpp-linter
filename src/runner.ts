import * as vscode from "vscode";
import {
    DISPLAY_NAME,
    CompilerOption,
    ClangTidyOption,
    CppCheckOption,
    GeneralOption,
    getCompilerOption,
    getClangTidyOption,
    getCppCheckOption,
    getGeneralOption
} from "./configuration";
import {updateDiagnostics} from "./diagnostics";
import {ReturnedOutput, runCommandOnProcess} from "./processRunner";
import {getCompileTask, getClangTidyTask, getCppCheckTask} from "./tasks";

class DiagnosisKeywords {
    constructor(readonly errors: string[], readonly warnings: string[], readonly information: string[]) {
        this.errors = errors;
        this.warnings = warnings;
        this.information = information;
    }
}

export class TaskResult {
    constructor(readonly output: string, readonly parsingExpression: RegExp, keywords: string[][]) {
        this.output = output;
        this.parsingExpression = parsingExpression;
        this.diagnosisKeywords = new DiagnosisKeywords(keywords[0], keywords[1], keywords[2]);
    }

    readonly diagnosisKeywords: DiagnosisKeywords;
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

    let tooltip = `${DISPLAY_NAME}: idle`;
    let text = "-";

    if (runCount > 0 && queueCount > 0) {
        tooltip = `${DISPLAY_NAME}: ${runCount} processes running, ${queueCount} processes in run queue`;
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
        tooltip = `${DISPLAY_NAME}: ${runCount} processes running`;
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

export async function run(
    file: vscode.Uri,
    status: vscode.StatusBarItem,
    logger: vscode.OutputChannel,
    diagnosticsCollection: vscode.DiagnosticCollection
): Promise<void> {
    if (_running.includes(file)) {
        logger.appendLine(`> Task is already running for file: ${file.fsPath}. Skipping duplicate task...`);
        return;
    } else if (_running.length >= getGeneralOption<number>(GeneralOption.maximumParallelTasks)) {
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
            getCompilerOption<boolean>(CompilerOption.enabled)
                ? runCommandOnProcess(getCompileTask(file), ReturnedOutput.error, logger)
                : empty(),
            getClangTidyOption<boolean>(ClangTidyOption.enabled)
                ? runCommandOnProcess(getClangTidyTask(file), ReturnedOutput.normal, logger)
                : empty(),
            getCppCheckOption<boolean>(CppCheckOption.enabled)
                ? runCommandOnProcess(getCppCheckTask(file), ReturnedOutput.error, logger)
                : empty()
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
                    new TaskResult(
                        result[0],
                        new RegExp(getCompilerOption<string>(CompilerOption.parsingRegex), "g"),
                        getCompilerOption<string[][]>(CompilerOption.diagnosisKeywords)
                    ),
                    new TaskResult(
                        result[1],
                        new RegExp(getClangTidyOption<string>(ClangTidyOption.parsingRegex), "g"),
                        getClangTidyOption<string[][]>(ClangTidyOption.diagnosisKeywords)
                    ),
                    new TaskResult(
                        result[2],
                        new RegExp(getCppCheckOption<string>(CppCheckOption.parsingRegex), "g"),
                        getCppCheckOption<string[][]>(CppCheckOption.diagnosisKeywords)
                    )
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

        await run(newFileToCheck, status, logger, diagnosticsCollection);
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
