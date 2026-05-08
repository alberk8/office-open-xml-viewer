import * as vscode from 'vscode';
import { McpServerNotInstalledError, resolveBinaryPath } from './installer';

export class OoxmlMcpProvider implements vscode.McpServerDefinitionProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  async provideMcpServerDefinitions(
    _token: vscode.CancellationToken,
  ): Promise<vscode.McpServerDefinition[]> {
    const cfg = vscode.workspace.getConfiguration('ooxmlViewer.mcpServer');
    const enabled = cfg.get<'auto' | 'always' | 'never'>('enabled', 'auto');

    if (enabled === 'never') return [];
    if (enabled === 'auto' && !(await workspaceHasOoxmlFiles())) return [];

    let binPath: string;
    try {
      binPath = await resolveBinaryPath(this.context, {
        override: cfg.get<string>('binaryPath', ''),
        consentToDownload: false,
      });
    } catch (err) {
      if (err instanceof McpServerNotInstalledError) {
        // Activation flow handles the install prompt and calls refresh().
        return [];
      }
      throw err;
    }

    return [
      new vscode.McpStdioServerDefinition(
        'ooxml-mcp-server',
        binPath,
        [],
        { RUST_LOG: 'warn' },
        (this.context.extension.packageJSON as { version: string }).version,
      ),
    ];
  }

  async resolveMcpServerDefinition(
    server: vscode.McpServerDefinition,
    _token: vscode.CancellationToken,
  ): Promise<vscode.McpServerDefinition> {
    return server;
  }
}

export async function workspaceHasOoxmlFiles(): Promise<boolean> {
  const found = await vscode.workspace.findFiles(
    '**/*.{xlsx,docx,pptx}',
    '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/target/**,**/.venv/**}',
    1,
  );
  return found.length > 0;
}
