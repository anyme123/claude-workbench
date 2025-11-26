export type View =
  | "projects"
  | "editor"
  | "codex-editor"
  | "claude-file-editor"
  | "claude-code-session"
  | "claude-tab-manager"
  | "settings"
  | "mcp"
  | "usage-dashboard"
  | "project-settings"
  | "enhanced-hooks-manager"
  | "claude-extensions";

export interface NavigationState {
  currentView: View;
  history: View[];
  previousView: View | null;
}
