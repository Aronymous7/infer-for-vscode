import * as vscode from 'vscode';
import { currentInferCost, inferCostHistories, activeTextEditor } from '../inferController';

let webviewOverview: vscode.WebviewPanel;
let webviewHistory: vscode.WebviewPanel;

// Dispose and close all open webviews.
export function disposeWebviews() {
  if (webviewOverview) {
    webviewOverview.dispose();
  }
  if (webviewHistory) {
    webviewHistory.dispose();
  }
}

// Create the webview that shows an overview of the costs of all functions in the current file, where
// the function on which the overview CodeLens was clicked is highlighted in the overview.
export function createWebviewOverview(extensionUri: vscode.Uri, selectedMethodName: string, selectedMethodParameters: string[]) {
  if (webviewOverview) {
    webviewOverview.dispose();
  }

  // Create and show a new webview panel
  webviewOverview = vscode.window.createWebviewPanel(
    'inferCostOverview', // Identifies the type of the webview. Used internally
    'Infer Cost Overview', // Title of the panel displayed to the user
    {viewColumn: vscode.ViewColumn.Two, preserveFocus: true}, // Editor column to show the new webview panel in.
    {localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'media')]} // Webview options.
  );

  let inferCostOverviewHtmlString = "";
  for (let inferCostItem of currentInferCost) {
    if (inferCostItem.method_name === '<init>') { continue; }
    inferCostOverviewHtmlString += `<div>
  <h2${(inferCostItem.method_name === selectedMethodName && JSON.stringify(inferCostItem.parameterTypes) === JSON.stringify(selectedMethodParameters)) ? ' class="selected-method"' : ''}>${inferCostItem.method_name} (line ${inferCostItem.loc.lnum})</h2>
  <div>
    <h3>Execution cost:</h3>
    <ul>
      <li>${inferCostItem.exec_cost.polynomial}</li>
      <li>${inferCostItem.exec_cost.big_o}</li>
    </ul>
  </div>
</div>
<hr>`;
  }

  const stylesPath = vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'media', 'styles.css');
  const stylesUri = webviewOverview.webview.asWebviewUri(stylesPath);

  webviewOverview.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webviewOverview.webview.cspSource};"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost Overview</title>
  <link href="${stylesUri}" rel="stylesheet">
</head>
<body>
  <h1>Infer Cost Overview</h1>
  <div>
    <hr>
    ${inferCostOverviewHtmlString}
  <div>
</body>
</html>`;
}

// Create the webview that shows the detail/history view for a function. This includes the code
// changes that potentially led or might lead to a change in cost, the trace for the cost as
// provided by Infer, and of course the costs themselves.
export function createWebviewHistory(extensionUri: vscode.Uri, methodKey: string) {
  if (webviewHistory) {
    webviewHistory.dispose();
  }

  // Create and show a new webview panel
  webviewHistory = vscode.window.createWebviewPanel(
    'inferCostHistory', // Identifies the type of the webview. Used internally
    'Infer Cost History', // Title of the panel displayed to the user
    {viewColumn: vscode.ViewColumn.Two, preserveFocus: true}, // Editor column to show the new webview panel in.
    {localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'media')]} // Webview options.
  );

  const costHistory = inferCostHistories.get(methodKey);
  if (!costHistory || costHistory.length <= 0) { return; }

  let inferCostHistoryHtmlString = ``;
  for (let costHistoryItem of costHistory) {
    let changeCauseString = "";
    if (costHistoryItem.changeCauseMethods) {
      let causeMethodsString = "";
      for (const causeMethod of costHistoryItem.changeCauseMethods) {
        causeMethodsString += `<li>${causeMethod}</li>`;
      }
      let changeMessage = "";
      if (costHistoryItem === costHistory[0]) {
        changeMessage = "<strong class=\"first\">Cost might have changed significantly! Potential causes (additions or removals):</strong>";
      } else {
        changeMessage = "<strong>↑↑↑ Potential causes for cost change (additions or removals): ↑↑↑</strong>";
      }
        changeCauseString = `<div>
  ${changeMessage}
  <ul>
    ${causeMethodsString}
  </ul>
  <hr>
</div>`;
    }

    let traceString = ``;
    if (costHistoryItem === costHistory[0]) {
      for (const traceItem of costHistoryItem.trace) {
        traceString += `<ul class="trace-item">`;
        let level = 0;
        while (level < traceItem.level) {
          traceString += `<ul>`;
          level++;
        }

        traceString += `<li>File: ${traceItem.filename}</li>
  <li>Line: ${traceItem.line_number}</li>
  <li>Description: ${traceItem.description}</li>`;

        while (level > 0) {
          traceString += `</ul>`;
          level--;
        }
        traceString += `</ul>`;
      }
      traceString = `<div>
  <h3>Trace:</h3>
  <input type="checkbox" id="trace_checkbox">
  <div id="hidden">
    ${traceString}
  </div>
  <label for="trace_checkbox" class="show-hide-button">Show/hide trace</label>
</div>`;
    }

    inferCostHistoryHtmlString += `<div>
  ${changeCauseString}
  <h2>${costHistoryItem.timestamp + (costHistoryItem === costHistory[0] ? ' (most recent)' : '')}</h2>
  <div>
    <h3>Execution cost:</h3>
    <ul>
      <li>${costHistoryItem.exec_cost.polynomial}</li>
      <li>${costHistoryItem.exec_cost.big_o}</li>
    </ul>
  </div>
  ${traceString}
</div>
<hr>`;
  }

  const stylesPath = vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'media', 'styles.css');
  const stylesUri = webviewHistory.webview.asWebviewUri(stylesPath);

  webviewHistory.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webviewHistory.webview.cspSource};"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost History</title>
  <link href="${stylesUri}" rel="stylesheet">
</head>
<body>
  <h1>Infer Cost History for: ${costHistory[0].method_name} (line ${costHistory[0].loc.lnum})</h1>
  <div>
    <hr>
    ${inferCostHistoryHtmlString}
  <div>
</body>
</html>`;
}