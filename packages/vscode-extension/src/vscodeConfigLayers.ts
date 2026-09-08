import * as vscode from 'vscode';
import { ConfigLayers, ConfigOverlay } from '@design-token-extractor/core';

const SETTING_PATHS = [
  'include',
  'exclude',
  'outputDir',
  'naming.case',
  'naming.prefix',
  'clustering.colorDeltaE',
  'clustering.spacingToleranceRem',
  'theme.darkMarkers',
] as const;

function setPath(target: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (typeof next !== 'object' || next === null) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export function readVscodeConfigLayers(
  scope?: vscode.ConfigurationScope,
  config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('designTokens', scope)
): ConfigLayers {
  const user: ConfigOverlay = {};
  const workspace: ConfigOverlay = {};
  let hasUser = false;
  let hasWorkspace = false;

  for (const key of SETTING_PATHS) {
    const inspected = config.inspect(key);
    if (!inspected) continue;
    if (inspected.globalValue !== undefined) {
      setPath(user as Record<string, unknown>, key, inspected.globalValue);
      hasUser = true;
    }
    const workspaceValue = inspected.workspaceFolderValue !== undefined
      ? inspected.workspaceFolderValue
      : inspected.workspaceValue;
    if (workspaceValue !== undefined) {
      setPath(workspace as Record<string, unknown>, key, workspaceValue);
      hasWorkspace = true;
    }
  }

  return {
    user: hasUser ? user : null,
    workspace: hasWorkspace ? workspace : null,
  };
}
