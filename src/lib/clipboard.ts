/**
 * ✅ Unified Clipboard Service - Centralized clipboard operations with automatic fallback
 *
 * Provides a singleton service for clipboard operations across the application:
 * 1. Tauri clipboard plugin (desktop app - most reliable)
 * 2. Navigator Clipboard API (modern browsers)
 * 3. execCommand fallback (legacy browsers)
 *
 * @example
 * ```typescript
 * import { clipboardService } from '@/lib/clipboard';
 *
 * // Write text
 * await clipboardService.writeText('Hello World');
 *
 * // Read text (if supported)
 * const text = await clipboardService.readText();
 * ```
 */

/**
 * Tauri Window interface for type safety
 */
interface TauriWindow extends Window {
  __TAURI_INTERNALS__?: unknown;
}

let tauriInvoke:
  | ((command: string, args?: Record<string, any>) => Promise<any>)
  | null
  | undefined = undefined;

/**
 * Detect whether we are running inside a Tauri environment.
 */
const isTauriEnvironment = (): boolean => {
  return (
    typeof window !== "undefined" &&
    // ✅ FIXED: Improved type safety
    Boolean((window as TauriWindow).__TAURI_INTERNALS__)
  );
};

/**
 * Load the Tauri clipboard plugin lazily.
 */
const getTauriInvoke = async () => {
  if (tauriInvoke === null) {
    return null;
  }

  if (typeof tauriInvoke === "function") {
    return tauriInvoke;
  }

  try {
    const module = await import("@tauri-apps/api/core");
    tauriInvoke = module.invoke;
    return tauriInvoke;
  } catch (error) {
    console.error("[Clipboard] Failed to load Tauri core invoke:", error);
    tauriInvoke = null;
    return null;
  }
};

/**
 * Copy plain text to the system clipboard.
 * Prefers the Tauri clipboard plugin, then Navigator clipboard API, finally a legacy execCommand fallback.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  const normalizedText = text ?? "";

  // Try the Tauri clipboard plugin first when running in the desktop app.
  if (isTauriEnvironment()) {
    const invoke = await getTauriInvoke();
    if (invoke) {
      try {
        await invoke("plugin:clipboard-manager|write_text", { text: normalizedText });
        return;
      } catch (error) {
        console.error("[Clipboard] Tauri invoke write failed:", error);
      }
    }
  }

  // Fall back to the modern Navigator clipboard API.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalizedText);
      return;
    } catch (error) {
      console.error("[Clipboard] Navigator clipboard write failed:", error);
    }
  }

  // Final fallback – use a hidden textarea with execCommand.
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = normalizedText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    try {
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (selectedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(selectedRange);
      }
      if (!successful) {
        throw new Error("execCommand returned false");
      }
      return;
    } catch (error) {
      document.body.removeChild(textarea);
      if (selectedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(selectedRange);
      }
      console.error("[Clipboard] Legacy execCommand copy failed:", error);
    }
  }

  throw new Error("Unable to copy text using any available clipboard method");
}

/**
 * ✅ Clipboard Service Singleton Class
 *
 * Centralized clipboard service with improved error handling and read support.
 */
class ClipboardService {
  private static instance: ClipboardService;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): ClipboardService {
    if (!ClipboardService.instance) {
      ClipboardService.instance = new ClipboardService();
    }
    return ClipboardService.instance;
  }

  /**
   * Write text to clipboard (delegates to existing copyTextToClipboard)
   */
  async writeText(text: string): Promise<void> {
    return copyTextToClipboard(text);
  }

  /**
   * Read text from clipboard
   * Only works with Tauri plugin or Navigator Clipboard API
   */
  async readText(): Promise<string> {
    // Try Tauri clipboard plugin first
    if (isTauriEnvironment()) {
      const invoke = await getTauriInvoke();
      if (invoke) {
        try {
          const text = await invoke("plugin:clipboard-manager|read_text");
          return text as string;
        } catch (error) {
          console.error("[Clipboard] Tauri invoke read failed:", error);
        }
      }
    }

    // Fall back to Navigator clipboard API
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        console.error("[Clipboard] Navigator clipboard read failed:", error);
        throw new Error("Unable to read clipboard: permission denied or not supported");
      }
    }

    throw new Error("Clipboard read not supported in this environment");
  }

  /**
   * Check if clipboard operations are supported
   */
  isSupported(): boolean {
    return isTauriEnvironment() ||
           (typeof navigator !== "undefined" && Boolean(navigator.clipboard));
  }
}

/**
 * ✅ Export singleton instance for easy access
 *
 * @example
 * import { clipboardService } from '@/lib/clipboard';
 * await clipboardService.writeText('Hello');
 */
export const clipboardService = ClipboardService.getInstance();
