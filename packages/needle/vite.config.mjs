import pkg from "./package.json" with { type: "json" }
import { workspaceTasks } from "../../script/vite-tasks.ts"

export default workspaceTasks(pkg)
