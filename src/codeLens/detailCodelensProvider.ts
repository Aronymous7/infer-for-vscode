import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from '../types';
import { isExtensionEnabled } from '../extension';
import {
  findMethodDeclarations,
  onSignificantCodeChange
} from '../javaCodeHandler';
import { currentInferCost } from '../inferController';

export class DetailCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];

  private document: vscode.TextDocument | undefined;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor(inferCost: InferCostItem[]) {
    onSignificantCodeChange(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (isExtensionEnabled) {
      this.document = document;
      const methodDeclarations = findMethodDeclarations(this.document);
      this.codeLenses = [];
      methodDeclarations.forEach(methodDeclaration => {
        this.codeLenses.push(new vscode.CodeLens(methodDeclaration.declarationRange));
      });
      return this.codeLenses;
    }
    return [];
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    if (isExtensionEnabled) {
      if (!this.document) { return; }
      const methodDeclarations = findMethodDeclarations(this.document);
      let thisMethodDeclaration: MethodDeclaration | undefined;
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          thisMethodDeclaration = methodDeclaration;
          return true;
        }
      });
      if (!thisMethodDeclaration) {
        codeLens.command = {
          title: "No performance data available for this method.",
          command: "infer-for-vscode.detailCodelensError"
        };
        return codeLens;
      }
      let currentInferCostItem: InferCostItem | undefined;
      for (let inferCostItem of currentInferCost) {
        if (inferCostItem.method_name === thisMethodDeclaration.name && JSON.stringify(inferCostItem.parameters) === JSON.stringify(thisMethodDeclaration.parameters)) {
          currentInferCostItem = inferCostItem;
          break;
        }
      }
      if (!currentInferCostItem) {
        codeLens.command = {
          title: "No performance data available for this method.",
          command: "infer-for-vscode.detailCodelensError"
        };
        return codeLens;
      }
      codeLens.command = {
        title: `Execution cost${currentInferCostItem.changeCauseMethods ? " (might have changed!)" : ""}: ${currentInferCostItem.exec_cost.polynomial} ~~ ${currentInferCostItem.exec_cost.big_o}`,
        command: "infer-for-vscode.detailCodelensAction",
        arguments: [currentInferCostItem.id]
      };
      return codeLens;
    }
    return null;
  }
}