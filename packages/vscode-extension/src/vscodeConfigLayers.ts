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
  'clustering.minOccurrences',
  'theme.darkMarkers',
  'composites.mode',
] as const;

type SettingPath = (typeof SETTING_PATHS)[number];

/** Assign known keys only — no dynamic property writes (CodeQL js/prototype-pollution-assignment). */
function applySetting(target: ConfigOverlay, key: SettingPath, value: unknown): void {
  switch (key) {
    case 'include':
      target.include = value;
      return;
    case 'exclude':
      target.exclude = value;
      return;
    case 'outputDir':
      target.outputDir = value;
      return;
    case 'naming.case':
      target.naming = { ...target.naming, case: value };
      return;
    case 'naming.prefix':
      target.naming = { ...target.naming, prefix: value };
      return;
    case 'clustering.colorDeltaE':
      target.clustering = { ...target.clustering, colorDeltaE: value };
      return;
    case 'clustering.spacingToleranceRem':
      target.clustering = { ...target.clustering, spacingToleranceRem: value };
      return;
    case 'clustering.minOccurrences':
      target.clustering = { ...target.clustering, minOccurrences: value };
      return;
    case 'theme.darkMarkers':
      target.theme = { ...target.theme, darkMarkers: value };
      return;
    case 'composites.mode':
      target.composites = { ...target.composites, mode: value };
      return;
  }
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
      applySetting(user, key, inspected.globalValue);
      hasUser = true;
    }
    const workspaceValue = inspected.workspaceFolderValue !== undefined
      ? inspected.workspaceFolderValue
      : inspected.workspaceValue;
    if (workspaceValue !== undefined) {
      applySetting(workspace, key, workspaceValue);
      hasWorkspace = true;
    }
  }

  return {
    user: hasUser ? user : null,
    workspace: hasWorkspace ? workspace : null,
  };
}
