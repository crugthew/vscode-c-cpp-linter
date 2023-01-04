import * as vscode from "vscode";
import {ChildProcess, exec} from "child_process";
import {GeneralOption, getGeneralOption} from "./configuration";
import {Task} from "./tasks";

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
    normal: string = "";
    error: string = "";
}

function getProcessId(task: Task): string {
    return task.command.file.fsPath + task.name;
}

function killProcess(processId: string, name: string, logger: vscode.OutputChannel): void {
    const process = _processes.get(processId) || undefined;
    if (process === undefined) {
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

function runProcess(
    processId: string,
    name: string,
    command: string,
    workingDirectory: vscode.Uri,
    logger: vscode.OutputChannel
): Thenable<ProcessOutput> {
    killProcess(processId, name, logger);

    const time = Date.now();
    return new Promise((resolve) => {
        logger.appendLine(`> Running '${name}' task...`);
        logger.appendLine(`> Command: '${command}'`);
        logger.appendLine(`> Working Directory: '${workingDirectory.fsPath}'`);

        _processes.set(
            processId,
            exec(command, {cwd: workingDirectory.fsPath}, (error, stdout, stderr) => {
                const result = new ProcessOutput();
                if (!error || (!!error && !error.killed)) {
                    if (getGeneralOption<boolean>(GeneralOption.showOutputFromLinters)) {
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
    normal,
    error,
    both
}

export function runTask(task: Task, returnedOutput: ReturnedOutput, logger: vscode.OutputChannel): Thenable<string> {
    const processId = getProcessId(task);
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: getGeneralOption<boolean>(GeneralOption.showInformationDialog)
                ? `Running '${task.name}' task on '${task.command.file.fsPath}'...`
                : "",
            cancellable: true
        },
        (progress, token) => {
            token.onCancellationRequested(() => {
                progress.report({increment: 100});
                killProcess(processId, task.name, logger);
            });

            return new Promise((resolve) => {
                runProcess(processId, task.name, task.command.command.join(" "), task.command.directory, logger).then((result) => {
                    switch (returnedOutput) {
                        case ReturnedOutput.normal: {
                            return resolve(result.normal);
                        }
                        case ReturnedOutput.error: {
                            return resolve(result.error);
                        }
                        case ReturnedOutput.both: {
                            return resolve(result.normal + result.error);
                        }
                    }
                });
            });
        }
    );
}

export function killTask(task: Task, logger: vscode.OutputChannel): void {
    killProcess(getProcessId(task), task.name, logger);
}
