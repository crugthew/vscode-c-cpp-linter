import * as vscode from "vscode";
import {existsSync} from "fs";
import {internalName, getIgnoredPaths} from "./configuration";
import {TaskResult} from "./runner";

class DiagnosticForFile {
    constructor(file: vscode.Uri, diagnostic: vscode.Diagnostic) {
        this.file = file;
        this.diagnostic = diagnostic;
        this.diagnostic.source = internalName;
    }

    file: vscode.Uri;
    diagnostic: vscode.Diagnostic;
}

function generateDiagnosticsForFiles(taskResult: TaskResult): DiagnosticForFile[] {
    const diagnostics: DiagnosticForFile[] = [];
    taskResult.output.split("\n").forEach((value: string) => {
        const matches = value.matchAll(taskResult.parsingExpression);
        for (const match of matches) {
            if (match.length === 6) {
                const file = match[1] || "";
                const line = parseInt(match[2]) || 1;
                const column = parseInt(match[3]) || 1;
                const severityString = match[4] || "";
                const text = match[5] || "";

                if (!!file && !!line && !!column && !!severityString && !!text) {
                    if (!existsSync(file)) {
                        continue;
                    }

                    let shouldBreak = false;
                    for (const toIgnore of getIgnoredPaths()) {
                        if (!!file.match(toIgnore)) {
                            shouldBreak = true;
                            break;
                        }
                    }
                    if (shouldBreak) {
                        continue;
                    }

                    let severity;
                    if (taskResult.severityKeywords.errors.includes(severityString)) {
                        severity = vscode.DiagnosticSeverity.Error;
                    } else if (taskResult.severityKeywords.warnings.includes(severityString)) {
                        severity = vscode.DiagnosticSeverity.Warning;
                    } else if (taskResult.severityKeywords.information.includes(severityString)) {
                        severity = vscode.DiagnosticSeverity.Information;
                    } else {
                        continue;
                    }

                    diagnostics.push(
                        new DiagnosticForFile(
                            vscode.Uri.file(file),
                            new vscode.Diagnostic(
                                new vscode.Range(new vscode.Position(line - 1, column - 1), new vscode.Position(line - 1, column - 1)),
                                text,
                                severity
                            )
                        )
                    );
                }
            }
        }
    });
    return diagnostics;
}

const _diagnostics = new Map<string, DiagnosticForFile[]>(); // key -> source file (string because map breaks otherwise!?), value -> generated diagnostics from the source file

function update(diagnosticsCollection: vscode.DiagnosticCollection): void {
    function alreadyInTheList(list: vscode.Diagnostic[], value: vscode.Diagnostic) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].range.isEqual(value.range) && list[i].message === value.message && list[i].severity === value.severity) {
                return true;
            }
        }
        return false;
    }

    // aggregate all sources to a final map
    const result = new Map<string, vscode.Diagnostic[]>();
    _diagnostics.forEach((diagnostics: DiagnosticForFile[]) => {
        diagnostics.forEach((diagnostic: DiagnosticForFile) => {
            const fileDiagnostics = result.get(diagnostic.file.fsPath) || [];
            if (!alreadyInTheList(fileDiagnostics, diagnostic.diagnostic)) {
                fileDiagnostics.push(diagnostic.diagnostic);
            }
            result.set(diagnostic.file.fsPath, fileDiagnostics);
        });
    });

    diagnosticsCollection.clear();
    result.forEach((value: vscode.Diagnostic[], key: string) => {
        diagnosticsCollection.set(vscode.Uri.file(key), value);
    });
}

export function updateDiagnostics(file: vscode.Uri, taskResults: TaskResult[], diagnosticsCollection: vscode.DiagnosticCollection): void {
    let diagnostics: DiagnosticForFile[] = [];
    taskResults.forEach((taskResult: TaskResult) => {
        diagnostics = diagnostics.concat(generateDiagnosticsForFiles(taskResult));
    });

    _diagnostics.set(file.fsPath, diagnostics);
    update(diagnosticsCollection);
}

export function clearDiagnosticsForFile(file: vscode.Uri, diagnosticsCollection: vscode.DiagnosticCollection): void {
    _diagnostics.set(file.fsPath, []);
    update(diagnosticsCollection);
}

export function clearAllDiagnostics(diagnosticsCollection: vscode.DiagnosticCollection): void {
    _diagnostics.clear();
    update(diagnosticsCollection);
}
