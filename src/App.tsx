import { NavigationProvider } from "@/contexts/NavigationContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { TabProvider } from "@/hooks/useTabs";
import { UpdateProvider } from "@/contexts/UpdateContext";
import { OutputCacheProvider } from "@/lib/outputCache";
import { AppLayout } from "@/components/layout/AppLayout";
import { ViewRouter } from "@/components/layout/ViewRouter";

/**
 * 主应用组件 - 管理 Claude 目录浏览器界面
 * Main App component - Manages the Claude directory browser UI
 */
function App() {
  return (
    <UpdateProvider>
      <OutputCacheProvider>
        <NavigationProvider>
          <ProjectProvider>
            <TabProvider>
              <AppLayout>
                <ViewRouter />
              </AppLayout>
            </TabProvider>
          </ProjectProvider>
        </NavigationProvider>
      </OutputCacheProvider>
    </UpdateProvider>
  );
}

export default App;
