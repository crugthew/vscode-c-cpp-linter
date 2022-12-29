import * as vscode from "vscode";
import {ChildProcess, exec} from "child_process";
import {Task, getShowInformationDialog, getShowOutputFromLinters} from "./configuration";

const _processes = new Map<string, ChildProcess>();
const _times = new Map<string, number[]>();

function calculateTimeValues(name: string, beginTime: number, logger: vscode.OutputChannel): void {
    let allTimes = _times.get(name) || [];
    allTimes.push((Date.now() - beginTime) / 1000);
    if (allTimes.length > 10) {
        allTimes = allTimes.slice(1);
    }
    _times.set(name, allTimes);

    let averageTime = 0;
    allTimes.forEach((value: number) => {
        averageTime += value;
    });

    logger.appendLine(`> '${name}' task done!`);
    logger.appendLine(`> '${name}' task time: ${allTimes[allTimes.length - 1].toFixed(2).toString()} seconds`);
    logger.appendLine(`> '${name}' task average time: ${(averageTime / allTimes.length).toFixed(2).toString()} seconds`);
}

class ProcessOutput {
    constructor(normal: string, error: string) {
        this.normal = normal;
        this.error = error;
    }

    normal: string;
    error: string;
}

function killProcess(process: ChildProcess | undefined, name: string, logger: vscode.OutputChannel): void {
    if (!process) {
        return;
    }

    if (!process.killed && !!process.exitCode) {
        return;
    }

    if (!process.killed) {
        logger.appendLine(`> Killing '${name}' task...`);
        process.kill();
    }
}

function stopProcess(processId: string, name: string, logger: vscode.OutputChannel): void {
    killProcess(_processes.get(processId) || undefined, name, logger);
}

function runProcess(
    processId: string,
    name: string,
    command: string,
    workingDirectory: vscode.Uri,
    logger: vscode.OutputChannel
): Thenable<ProcessOutput> {
    killProcess(_processes.get(processId) || undefined, name, logger);

    const time = Date.now();
    return new Promise((resolve) => {
        logger.appendLine(`> Running '${name}' task...`);
        logger.appendLine(`> Command: '${command}'`);
        logger.appendLine(`> Working Directory: '${workingDirectory}'`);

        _processes.set(
            processId,
            exec(command, {cwd: workingDirectory.fsPath}, (error, stdout, stderr) => {
                const result = new ProcessOutput("", "");
                if (!error || (!!error && !error.killed)) {
                    if (getShowOutputFromLinters()) {
                        if (!!stdout && stdout.length > 0) {
                            logger.appendLine(stdout);
                        }
                        if (!!stderr && stderr.length > 0) {
                            logger.appendLine(stderr);
                        }
                    }

                    calculateTimeValues(name, time, logger);
                    result.normal = stdout;
                    result.error = stderr;
                } else {
                    logger.appendLine(`> Something failed in '${name}' task!`);
                }

                resolve(result);
            })
        );
    });
}

export enum ReturnedOutput {
    NORMAL,
    ERROR,
    BOTH
}

export function runCommandOnProcess(task: Task | null, returnedOutput: ReturnedOutput, logger: vscode.OutputChannel): Thenable<string> {
    if (!task) {
        logger.appendLine(`> No configuration found! Please check your 'compile_commands.json' is correct and findable!`);
        return new Promise((resolve) => {
            resolve("");
        });
    }

    const processId = task.command.file.fsPath + task.name;
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: getShowInformationDialog() ? `Running '${task.name}' task on '${task.command.file.fsPath}'...` : "",
            cancellable: true
        },
        (progress, token) => {
            token.onCancellationRequested(() => {
                progress.report({increment: 100});
                stopProcess(processId, task.name, logger);
            });

            return new Promise((resolve) => {
                runProcess(processId, task.name, task.command.command.join(" "), task.command.directory, logger).then((result) => {
                    switch (returnedOutput) {
                        case ReturnedOutput.NORMAL: {
                            return resolve(result.normal);
                        }
                        case ReturnedOutput.ERROR: {
                            return resolve(result.error);
                        }
                        case ReturnedOutput.BOTH: {
                            return resolve(result.normal + result.error);
                        }
                    }
                });
            });
        }
    );
}
