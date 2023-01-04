import * as vscode from "vscode";
import {Mutex} from "async-mutex";
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
import {ReturnedOutput, runTask, killTask} from "./processRunner";
import {Task, getCompileTask, getClangTidyTask, getCppCheckTask} from "./tasks";

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

class Runnable {
    constructor(readonly file: vscode.Uri) {
        this.file = file;
    }

    tasks: Task[] = [];
}

let _runList: Runnable[] = [];
let _runQueue: Runnable[] = [];
const _mutex = new Mutex();

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function showProgress(runList: Runnable[], runQueue: Runnable[], status: vscode.StatusBarItem, logger: vscode.OutputChannel): void {
    let tooltip = `${DISPLAY_NAME}: idle`;
    let text = "-";

    if (runList.length > 0 && runQueue.length > 0) {
        tooltip = `${DISPLAY_NAME}: ${runList.length} processes running, ${runQueue.length} processes in run queue`;
        text = `${runList.length} | ${runQueue.length}`;

        tooltip += "\n\n Running:";
        for (const runnable of runList) {
            tooltip += `\n ${runnable.file.fsPath}`;
        }
        tooltip += "\n\n Waiting:";
        for (const runnable of runQueue) {
            tooltip += `\n ${runnable.file.fsPath}`;
        }
    } else if (runList.length > 0) {
        tooltip = `${DISPLAY_NAME}: ${runList.length} processes running`;
        text = `${runList.length}`;

        tooltip += "\n\n Running:";
        for (const runnable of runList) {
            tooltip += `\n ${runnable.file.fsPath}`;
        }
    }

    status.tooltip = tooltip;
    status.text = text;

    if (runList.length > 0) {
        logger.appendLine(`> Processes running: ${runList.length}`);
    }
    if (runQueue.length > 0) {
        logger.appendLine(`> Processes in queue: ${runQueue.length}`);
    }
}

export async function run(
    file: vscode.Uri,
    status: vscode.StatusBarItem,
    logger: vscode.OutputChannel,
    diagnosticsCollection: vscode.DiagnosticCollection
): Promise<void> {
    let quit = false;

    await _mutex.runExclusive(async () => {
        const runnableInList = _runList.find((runnable: Runnable) => {
            return runnable.file.fsPath === file.fsPath;
        });
        if (!!runnableInList) {
            quit = true;
            logger.appendLine(`> Task is already running for file: ${file.fsPath}. Skipping duplicate task...`);
            return;
        } else if (_runList.length >= getGeneralOption<number>(GeneralOption.maximumParallelTasks)) {
            const runnableInQueue = _runQueue.find((runnable: Runnable) => {
                return runnable.file.fsPath === file.fsPath;
            });
            if (!runnableInQueue) {
                quit = true;
                logger.appendLine(`> Task moved to queue for file: ${file.fsPath}.`);
                _runQueue.unshift(new Runnable(file));
                showProgress(_runList, _runQueue, status, logger);
            }
            return;
        }

        _runList.unshift(new Runnable(file));
        showProgress(_runList, _runQueue, status, logger);
    });

    if (quit) {
        return;
    }

    let success: boolean = true;
    let result: string[] = ["", "", ""];

    try {
        function empty(): Thenable<string> {
            return new Promise((resolve) => {
                resolve("");
            });
        }

        let tasks: Task[] = [getCompileTask(file), getClangTidyTask(file), getCppCheckTask(file)];
        await _mutex.runExclusive(async () => {
            const runnableIndex = _runList.findIndex((runnable: Runnable) => {
                return runnable.file.fsPath === file.fsPath;
            });
            _runList[runnableIndex].tasks = tasks;
        });

        result = await Promise.all([
            getCompilerOption<boolean>(CompilerOption.enabled) ? runTask(tasks[0], ReturnedOutput.error, logger) : empty(),
            getClangTidyOption<boolean>(ClangTidyOption.enabled) ? runTask(tasks[1], ReturnedOutput.normal, logger) : empty(),
            getCppCheckOption<boolean>(CppCheckOption.enabled) ? runTask(tasks[2], ReturnedOutput.error, logger) : empty()
        ]);
    } catch (error) {
        success = false;

        const errorMessage = getErrorMessage(error);
        logger.appendLine(`> Something failed with error: ${errorMessage}`);
        vscode.window.showErrorMessage(errorMessage);
    }

    let shouldUpdateDiagnostics = false;
    let newFileToCheck: vscode.Uri | undefined = undefined;

    await _mutex.runExclusive(async () => {
        const runnableIndex = _runList.findIndex((runnable: Runnable) => {
            return runnable.file.fsPath === file.fsPath;
        });
        if (runnableIndex !== -1) {
            _runList.splice(runnableIndex, 1);

            if (success) {
                logger.appendLine(`> Tasks completed for file: ${file.fsPath}. Will update diagnostics...`);
                shouldUpdateDiagnostics = true;
            }
        } else {
            logger.appendLine(`> Tasks were was cancelled for file: ${file.fsPath}. Skipping diagnostics update...`);
        }

        if (_runQueue.length > 0) {
            newFileToCheck = _runQueue[0].file;
            _runQueue = _runQueue.slice(1);
        }

        showProgress(_runList, _runQueue, status, logger);
    });

    if (shouldUpdateDiagnostics) {
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

    if (newFileToCheck !== undefined) {
        await run(newFileToCheck, status, logger, diagnosticsCollection);
    }
}

export async function cancelRun(file: vscode.Uri, logger: vscode.OutputChannel): Promise<void> {
    let tasks: Task[] = [];
    await _mutex.runExclusive(async () => {
        const runnableIndex = _runList.findIndex((runnable: Runnable) => {
            return runnable.file.fsPath === file.fsPath;
        });
        if (runnableIndex === -1) {
            return;
        }

        tasks = _runList[runnableIndex].tasks;
        _runList.splice(runnableIndex, 1);
    });

    tasks.forEach((task: Task) => {
        killTask(task, logger);
    });
}

export async function cancelAllRuns(logger: vscode.OutputChannel): Promise<void> {
    let runList: Runnable[] = [];
    await _mutex.runExclusive(async () => {
        _runList = [];
        _runQueue = [];
    });

    runList.forEach((runnable: Runnable) => {
        runnable.tasks.forEach((task: Task) => {
            killTask(task, logger);
        });
    });
}
