import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@/contexts/NavigationContext';
import { Breadcrumbs, BreadcrumbItem } from '@/components/ui/breadcrumb';

export const AppBreadcrumbs: React.FC = () => {
  const { t } = useTranslation();
  const { currentView, navigateTo, viewParams } = useNavigation();

  const breadcrumbs = [];

  // 根据不同视图构建面包屑路径
  switch (currentView) {
    case 'projects':
      // 进入项目后不显示面包屑（避免与下方的返回按钮+项目路径冗余）
      break;

    case 'editor':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="editor" current>
          CLAUDE.md 编辑器
        </BreadcrumbItem>
      );
      break;

    case 'claude-file-editor':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="file-editor" current>
          {viewParams?.file?.relative_path || '编辑文件'}
        </BreadcrumbItem>
      );
      break;

    case 'settings':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="settings" current>
          {t('navigation.settings')}
        </BreadcrumbItem>
      );
      break;

    case 'usage-dashboard':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="usage" current>
          使用统计
        </BreadcrumbItem>
      );
      break;

    case 'mcp':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="mcp" current>
          MCP 管理器
        </BreadcrumbItem>
      );
      break;

    case 'claude-extensions':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="extensions" current>
          扩展管理
        </BreadcrumbItem>
      );
      break;

    case 'project-settings':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="project-settings" current>
          项目设置
        </BreadcrumbItem>
      );
      break;

    case 'enhanced-hooks-manager':
      breadcrumbs.push(
        <BreadcrumbItem key="home" onClick={() => navigateTo('projects')}>
          {t('common.ccProjectsTitle')}
        </BreadcrumbItem>,
        <BreadcrumbItem key="hooks" current>
          Hooks 管理
        </BreadcrumbItem>
      );
      break;

    default:
      return null;
  }

  // 如果没有面包屑项，则不显示
  if (breadcrumbs.length === 0) return null;

  return (
    // ✨ Updated styling: Removed bg-muted/20 border, added subtle transparency to blend with AppLayout glassmorphism
    <div className="px-4 py-2 border-b border-border/40 bg-background/40 backdrop-blur-sm">
      <div className="container mx-auto">
        <Breadcrumbs>{breadcrumbs}</Breadcrumbs>
      </div>
    </div>
  );
};
