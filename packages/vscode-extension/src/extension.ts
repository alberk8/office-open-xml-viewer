import * as vscode from 'vscode';
import { DocxEditorProvider } from './providers/docxEditor';
import { XlsxEditorProvider } from './providers/xlsxEditor';
import { PptxEditorProvider } from './providers/pptxEditor';
import { activateMcp } from './mcp';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    DocxEditorProvider.register(context),
    XlsxEditorProvider.register(context),
    PptxEditorProvider.register(context),
  );
  activateMcp(context);
}

export function deactivate(): void {
  // nothing to clean up
}
