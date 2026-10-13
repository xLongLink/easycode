import HomeFooter from "../feature-plugins/home/footer"
import Live from "@opencode/live/tui"
import PromptBtw from "../feature-plugins/prompt/btw"
import PromptFooter from "../feature-plugins/prompt/footer"
import SidebarContext from "../feature-plugins/sidebar/context"
import SidebarFooter from "../feature-plugins/sidebar/footer"
import SidebarMcp from "../feature-plugins/sidebar/mcp"
import DiffViewer from "../feature-plugins/system/diff-viewer"
import Notifications from "../feature-plugins/system/notifications"
import Plugins from "../feature-plugins/system/plugins"
import Stats from "../feature-plugins/system/stats"

export const builtins = [
  HomeFooter,
  PromptFooter,
  PromptBtw,
  SidebarContext,
  SidebarMcp,
  SidebarFooter,
  Notifications,
  Plugins,
  Stats,
  DiffViewer,
  Live,
]
