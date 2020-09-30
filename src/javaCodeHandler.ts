import * as vscode from 'vscode';
import { MethodDeclaration, LineDiff } from './types';
import {
  activeTextEditor,
  savedDocumentTexts,
  inferCosts,
  currentInferCost,
  inferCostHistories
} from './inferController';

const Diff = require('diff');

export let nonConstantMethods: string[] = [];

const significantCodeChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onSignificantCodeChange: vscode.Event<void> = significantCodeChange.event;

const methodDeclarationRegex = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )*(?:\<.*\>\s+)?[\w\<\>\[\]\?]+\s+([A-Za-z_$][A-Za-z0-9_]*)(?<!if|switch|while|for|(?:public|protected|private|return) [A-Za-z_$][A-Za-z0-9_]*)\([^\)]*\)/gm);
const significantCodeChangeRegex = new RegExp(/(?<!\/\/.*)(while *\([^\)]*\)|for *\([^\)]*\)|[A-Za-z_$][A-Za-z0-9_]*(?<!\W+(if|switch))\([^\)]*\))/g);
const classRegex = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )*class\s[A-Za-z_$][A-Za-z0-9_]*(?:\<(.*?)\>)?/gm);
// public class SequenceFileProxyLoader<C extends Compound, B extends Blah> implements ProxySequenceReader<C> {

export function resetNonConstantMethods() {
  nonConstantMethods = [];
}
export function resetNonConstantMethodsForFile() {
  for (const inferCostItem of currentInferCost) {
    const methodIndex = nonConstantMethods.indexOf(inferCostItem.method_name);
    if (methodIndex > -1) {
      nonConstantMethods.splice(methodIndex, 1);
    }
  }
}

export function findMethodDeclarations(document: vscode.TextDocument) {
  let regex = new RegExp(classRegex);
  let text = document.getText();
  let matches: RegExpExecArray | null;
  let typeExtensions = new Map<string, string>();
  while (((matches = regex.exec(text)) !== null)) {
    if (matches[1]) {
      const extensions = matches[1].split(",");
      for (const extension of extensions) {
        const extensionParts = extension.trim().split(" ");
        if (extensionParts.length === 3 && extensionParts[1] === "extends") {
          typeExtensions.set(extensionParts[0], extensionParts[2]);
        }
      }
    }
  }

  regex = new RegExp(methodDeclarationRegex);
  text = document.getText();
  let methodDeclarations: MethodDeclaration[] = [];
  while ((matches = regex.exec(text)) !== null) {
    const line = document.lineAt(document.positionAt(matches.index).line);

    const declarationLines = matches[0].split("\n");
    const declarationStartPosition = new vscode.Position(line.lineNumber, 0);
    const declarationEndPosition = new vscode.Position(line.lineNumber + declarationLines.length - 1, declarationLines[declarationLines.length - 1].length);
    const declarationRange = new vscode.Range(declarationStartPosition, declarationEndPosition);

    const nameIndexOf = line.text.indexOf(matches[1]);
    const nameStartPosition = new vscode.Position(line.lineNumber, nameIndexOf);
    const nameEndPosition = new vscode.Position(line.lineNumber, nameIndexOf + matches[1].length);
    const nameRange = new vscode.Range(nameStartPosition, nameEndPosition);

    let parameterTypes = matches[0].split("(")[1].split(")")[0].split(",");
    if (parameterTypes[0] === "") {
      parameterTypes = [];
    }
    for (const i in parameterTypes) {
      const parameterParts = parameterTypes[i].trim().split(" ");
      let parameterType = parameterParts[0].split("<")[0];
      for (let i = 1; parameterType.match(/(public|protected|private|static|final|native|synchronized|abstract|transient)/); i++) {
        parameterType = parameterParts[i].split("<")[0];
      }
      for (const typeExtension of typeExtensions) {
        parameterType = parameterType.replace("...", "[]");
        if (parameterType.split("[")[0] === typeExtension[0]) {
          parameterType = parameterType.replace(typeExtension[0], typeExtension[1]);
        }
      }
      parameterTypes[i] = parameterType;
    }

    if (declarationRange && nameRange) {
      methodDeclarations.push({ name: matches[1], parameters: parameterTypes, declarationRange: declarationRange, nameRange: nameRange });
    }
  }
  return methodDeclarations;
}

export function significantCodeChangeCheck(savedText: string) {
  const previousText = savedDocumentTexts.get(activeTextEditor.document.fileName);
  if (!previousText) { return false; }

  let containingAndCauseMethods = new Map<string, string[]>();
  const methodWhitelist: string[] = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  let isSignificant = false;
  for (let diffTextPartIndex in diffText) {
    let diffTextPart = diffText[diffTextPartIndex];
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      let diffTextPartValueWithoutDeclarations = diffTextPart.value.replace(methodDeclarationRegex, "");
      let matches = diffTextPartValueWithoutDeclarations.match(significantCodeChangeRegex);
      if (matches) {
        let containingMethod = "";
        let containingMethodOccurences = new Map<string, number>();
        for (let i = 0; i < +diffTextPartIndex; i++){
          let prevDiffTextPart = diffText[i];
          const regex = new RegExp(methodDeclarationRegex);
          let declarationMatches: RegExpExecArray | null;
          while ((declarationMatches = regex.exec(prevDiffTextPart.value)) !== null) {
            let occurenceIndex = containingMethodOccurences.get(declarationMatches[1]);
            occurenceIndex = occurenceIndex ? occurenceIndex : 0;
            containingMethodOccurences.set(declarationMatches[1], occurenceIndex + 1);
            containingMethod = `${declarationMatches[1]}:${occurenceIndex}`;
          }
        }
        for (const match of matches) {
          let diffTextPartValueBeforeMatch = diffTextPart.value.split(match)[0];
          const regex = new RegExp(methodDeclarationRegex);
          let declarationMatches: RegExpExecArray | null;
          while ((declarationMatches = regex.exec(diffTextPartValueBeforeMatch)) !== null) {
            let occurenceIndex = containingMethodOccurences.get(declarationMatches[1]);
            occurenceIndex = occurenceIndex ? occurenceIndex : 0;
            containingMethodOccurences.set(declarationMatches[1], occurenceIndex + 1);
            containingMethod = `${declarationMatches[1]}:${occurenceIndex}`;
          }
          let methodName = match.split("(")[0].trim();
          if (!methodWhitelist.includes(methodName) && (nonConstantMethods.includes(methodName) || ["while", "for"].includes(methodName))) {
            let causeMethods = containingAndCauseMethods.get(containingMethod);
            if (causeMethods) {
              if (!causeMethods.includes(match)) {
                causeMethods.push(match);
                containingAndCauseMethods.set(containingMethod, causeMethods);
              }
            } else {
              containingAndCauseMethods.set(containingMethod, [match]);
            }
            isSignificant = true;
          }
        }
      }
    }
  }

  let occurenceIndices = new Map<string, number>();
  for (const inferCostItem of currentInferCost) {
    let occurenceIndex = occurenceIndices.get(inferCostItem.method_name);
    occurenceIndex = occurenceIndex ? occurenceIndex : 0;
    occurenceIndices.set(inferCostItem.method_name, occurenceIndex + 1);

    let causeMethods = containingAndCauseMethods.get(`${inferCostItem.method_name}:${occurenceIndex}`);
    inferCostItem.changeCauseMethods = causeMethods;
    let inferCostHistoryItem = inferCostHistories.get(inferCostItem.id);
    if (inferCostHistoryItem) {
      inferCostHistoryItem[0].changeCauseMethods = causeMethods;
      inferCostHistories.set(inferCostHistoryItem[0].id, inferCostHistoryItem);
    }
  }
  inferCosts.set(activeTextEditor.document.fileName, currentInferCost);

  significantCodeChange.fire();
  return isSignificant;
}

export function addMethodToWhitelist(methodName: string) {
  if (!methodName.match(/^[A-Za-z_$][A-Za-z0-9_]+$/gm)) {
    vscode.window.showInformationMessage("Not a valid method name.");
    return;
  }
  let methodWhitelist: string[] = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  for (const whitelistedMethod of methodWhitelist) {
    if (whitelistedMethod === methodName) {
      return;
    }
  }
  methodWhitelist.push(methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}

export function removeMethodFromWhitelist(methodName: string) {
  let methodWhitelist: string[] = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  methodWhitelist = methodWhitelist.filter(method => method !== methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}