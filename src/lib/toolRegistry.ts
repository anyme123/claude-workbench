/**
 * 工具注册中心 - 插件化工具渲染系统
 *
 * 提供动态工具注册机制，避免硬编码条件判断
 * 支持 MCP 工具的正则匹配和优先级解决
 */

import { FC } from 'react';

/**
 * 工具渲染 Props 统一接口
 */
export interface ToolRenderProps {
  /** 工具名称（小写，已规范化） */
  toolName: string;

  /** 工具输入对象 */
  input?: Record<string, any>;

  /** 工具结果对象 */
  result?: {
    content?: any;
    is_error?: boolean;
  };

  /** 工具唯一 ID */
  toolId?: string;

  /** 可选的回调函数 */
  onLinkDetected?: (url: string) => void;
}

/**
 * 工具渲染器定义
 */
export interface ToolRenderer {
  /** 工具名称（用于精确匹配） */
  name: string;

  /** 可选：正则匹配模式（用于 MCP 工具等） */
  pattern?: RegExp;

  /** 渲染函数 */
  render: FC<ToolRenderProps>;

  /** 优先级（数字越大优先级越高，用于解决冲突） */
  priority?: number;

  /** 描述 */
  description?: string;
}

/**
 * 工具注册中心类
 */
class ToolRegistryClass {
  private renderers: Map<string, ToolRenderer> = new Map();
  private patternRenderers: ToolRenderer[] = [];

  /**
   * 注册工具渲染器
   */
  register(renderer: ToolRenderer): void {
    // 精确名称注册
    this.renderers.set(renderer.name.toLowerCase(), renderer);

    // 如果有正则模式，同时添加到模式列表
    if (renderer.pattern) {
      this.patternRenderers.push(renderer);
      // 按优先级排序（降序）
      this.patternRenderers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }

  /**
   * 批量注册工具
   */
  registerBatch(renderers: ToolRenderer[]): void {
    renderers.forEach(renderer => this.register(renderer));
  }

  /**
   * 注销工具渲染器
   */
  unregister(name: string): void {
    const normalizedName = name.toLowerCase();
    const renderer = this.renderers.get(normalizedName);

    this.renderers.delete(normalizedName);

    // 从模式列表中移除
    if (renderer?.pattern) {
      this.patternRenderers = this.patternRenderers.filter(r => r.name !== name);
    }
  }

  /**
   * 获取工具渲染器
   * @param toolName 工具名称
   * @returns 渲染器或 null
   */
  getRenderer(toolName: string | undefined): ToolRenderer | null {
    if (!toolName) {
      console.warn('[ToolRegistry] Tool name is undefined');
      return null;
    }
    const normalizedName = toolName.toLowerCase();

    // 1. 精确匹配
    const exactMatch = this.renderers.get(normalizedName);
    if (exactMatch) {
      return exactMatch;
    }

    // 2. 正则模式匹配（按优先级顺序）
    for (const renderer of this.patternRenderers) {
      if (renderer.pattern && renderer.pattern.test(toolName)) {
        return renderer;
      }
    }

    return null;
  }

  /**
   * 检查工具是否已注册
   */
  hasRenderer(toolName: string): boolean {
    return this.getRenderer(toolName) !== null;
  }

  /**
   * 获取所有已注册的工具列表
   */
  getAllRenderers(): ToolRenderer[] {
    return Array.from(this.renderers.values());
  }

  /**
   * 清空所有注册
   */
  clear(): void {
    this.renderers.clear();
    this.patternRenderers = [];
  }

  /**
   * 获取注册统计
   */
  getStats(): { total: number; withPattern: number } {
    return {
      total: this.renderers.size,
      withPattern: this.patternRenderers.length,
    };
  }
}

// 导出单例实例
export const toolRegistry = new ToolRegistryClass();

// 导出类型（用于测试等场景）
export type ToolRegistry = ToolRegistryClass;
