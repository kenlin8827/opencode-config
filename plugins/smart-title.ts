/**
 * Smart Title 插件入口。
 *
 * OpenCode 会把 plugins 根目录中导出的每个函数视为服务端插件，
 * 因此根入口只能导出真正的插件函数；测试辅助函数保留在子模块中。
 */
export { SmartTitlePlugin } from "./smart-title/smart-title"
