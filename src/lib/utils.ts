import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { normalizeRawUsage } from './tokenExtractor';

/**
 * Combines multiple class values into a single string using clsx and tailwind-merge.
 * This utility function helps manage dynamic class names and prevents Tailwind CSS conflicts.
 *
 * @param inputs - Array of class values that can be strings, objects, arrays, etc.
 * @returns A merged string of class names with Tailwind conflicts resolved
 *
 * @example
 * cn("px-2 py-1", condition && "bg-blue-500", { "text-white": isActive })
 * // Returns: "px-2 py-1 bg-blue-500 text-white" (when condition and isActive are true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Usage data interface that supports both API formats
 *
 * @deprecated Use StandardizedTokenUsage from tokenExtractor.ts instead
 */
export interface UsageData {
  input_tokens: number;
  output_tokens: number;
  // Standard format (frontend expectation)
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  // API format (Claude API actual response)
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Standardizes usage data from Claude API to consistent frontend format.
 *
 * ⚠️ This function now delegates to tokenExtractor.ts for unified token normalization.
 * All token standardization logic is centralized in tokenExtractor.ts
 *
 * @param usage - Raw usage data from Claude API or frontend
 * @returns Standardized usage data with consistent field names
 *
 * @example
 * const apiUsage = {
 *   input_tokens: 100,
 *   output_tokens: 50,
 *   cache_creation_input_tokens: 20,
 *   cache_read_input_tokens: 10
 * };
 * const standardized = normalizeUsageData(apiUsage);
 * // Result: { input_tokens: 100, output_tokens: 50, cache_creation_tokens: 20, cache_read_tokens: 10 }
 */
export function normalizeUsageData(usage: any): UsageData {
  // Delegate to the unified token normalization system
  const standardized = normalizeRawUsage(usage);

  // Return in the legacy UsageData format for backward compatibility
  return {
    input_tokens: standardized.input_tokens,
    output_tokens: standardized.output_tokens,
    cache_creation_tokens: standardized.cache_creation_tokens,
    cache_read_tokens: standardized.cache_read_tokens,
    // Also include API format fields for full compatibility
    cache_creation_input_tokens: standardized.cache_creation_tokens,
    cache_read_input_tokens: standardized.cache_read_tokens,
  };
}

/**
 * Calculates total tokens from normalized usage data
 * @param usage - Normalized usage data
 * @returns Total token count including cache tokens
 */
export function calculateTotalTokens(usage: UsageData): number {
  return usage.input_tokens + usage.output_tokens +
         (usage.cache_creation_tokens || 0) + (usage.cache_read_tokens || 0);
} 