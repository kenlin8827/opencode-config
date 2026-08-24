import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "OpenCode Engineering",
  description: "Production Software Engineering Configuration for OpenCode",
  base: "/opencode-config/",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['SUMMARY.md'],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: "OpenCode Engineering",
      description: "Production Software Engineering & Multi-Agent Configuration for OpenCode",
      themeConfig: {
        siteTitle: 'OpenCode Engineering',
        nav: [
          { text: 'Getting Started', link: '/getting-started/' },
          { text: 'Core Capabilities', link: '/core/daily-use' },
          { text: 'Workflows & Guards', link: '/workflows/commands' },
          { text: 'Maintenance', link: '/maintenance/options' },
          { text: 'GitHub', link: 'https://github.com/kenlin8827/opencode-config' }
        ],
        sidebar: [
          {
            text: 'Part I: Getting Started',
            items: [
              { text: 'Overview & Quick Start', link: '/getting-started/' },
            ]
          },
          {
            text: 'Part II: Core Capabilities',
            items: [
              { text: 'Daily Use & Modes', link: '/core/daily-use' },
              { text: 'MCP Servers & Code Intelligence', link: '/core/mcp-servers' },
              { text: 'Configuration & Profiles', link: '/core/profiles' },
            ]
          },
          {
            text: 'Part III: Workflows & Governance',
            items: [
              { text: 'Workflow Slash Commands', link: '/workflows/commands' },
              { text: 'Auto-Advisor Mode', link: '/workflows/auto-advisor' },
              { text: 'Plugins & Project Guardrails', link: '/workflows/plugins' },
            ]
          },
          {
            text: 'Part IV: Maintenance & Reference',
            items: [
              { text: 'Installation & Options', link: '/maintenance/options' },
              { text: 'Troubleshooting & FAQ', link: '/maintenance/faq' },
            ]
          }
        ],
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 OpenCode Config Contributors'
        }
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: "OpenCode 生产级工程化配置",
      description: "为真实软件研发而生的 OpenCode 生产级工程化配置",
      themeConfig: {
        siteTitle: 'OpenCode 工程化配置',
        nav: [
          { text: '快速起步', link: '/zh/getting-started/' },
          { text: '核心能力', link: '/zh/core/daily-use' },
          { text: '进阶工作流与护栏', link: '/zh/workflows/commands' },
          { text: '安装与运维', link: '/zh/maintenance/options' },
          { text: 'GitHub', link: 'https://github.com/kenlin8827/opencode-config' }
        ],
        sidebar: {
          '/zh/': [
            {
              text: '第一部分：快速起步',
              items: [
                { text: '概览与快速上手', link: '/zh/getting-started/' },
              ]
            },
            {
              text: '第二部分：核心能力与使用',
              items: [
                { text: '日常使用与工作模式', link: '/zh/core/daily-use' },
                { text: 'MCP 代码智能与数据库', link: '/zh/core/mcp-servers' },
                { text: '模型配置与预设 Profiles', link: '/zh/core/profiles' },
              ]
            },
            {
              text: '第三部分：进阶工作流与护栏',
              items: [
                { text: '工作流斜杠命令', link: '/zh/workflows/commands' },
                { text: 'Auto-advisor 模式', link: '/zh/workflows/auto-advisor' },
                { text: '插件系统与项目护栏', link: '/zh/workflows/plugins' },
              ]
            },
            {
              text: '第四部分：安装进阶与运维',
              items: [
                { text: '安装器进阶与选项', link: '/zh/maintenance/options' },
                { text: '常见问题与排查 FAQ', link: '/zh/maintenance/faq' },
              ]
            }
          ]
        },
        footer: {
          message: '基于 MIT 协议发布。',
          copyright: 'Copyright © 2026 OpenCode Config Contributors'
        }
      }
    }
  },

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/kenlin8827/opencode-config' }
    ],
    search: {
      provider: 'local'
    }
  }
})
