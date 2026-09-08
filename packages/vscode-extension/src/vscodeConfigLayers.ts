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

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafeObjectKey(key: string): boolean {
  return key.length > 0 && !FORBIDDEN_KEYS.has(key);
}

function setPath(target: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  if (parts.some((part) => !isSafeObjectKey(part))) return;
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) current[key] = Object.create(null);
    current = current[key] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (!isSafeObjectKey(leaf)) return;
  current[leaf] = value;
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
