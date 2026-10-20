import type { NoteMode } from "./prompt";

interface ModeCopy {
  name: string;
  description: string;
}

/**
 * 内置模式的界面文案。提示词仍用 docs/plugin-modes.json 的英文原文，
 * 这里只翻译给用户看的名称和一句话说明。
 */
export const MODE_COPY: Record<string, ModeCopy> = {
  explain: {
    name: "概念解释",
    description: "用清晰的结构把概念讲透，适合第一次系统理解。",
  },
  "deep-inquiry": {
    name: "深度追问",
    description: "拆前提、找反例、权衡取舍，检验一个想法是否站得住。",
  },
  feynman: {
    name: "费曼教学",
    description: "用类比和白话讲给外行听，暴露理解里的空洞。",
  },
  "book-summary": {
    name: "读书摘要",
    description: "按章节提炼脉络、关键要点和可执行清单。",
  },
  researcher: {
    name: "主题研究",
    description: "汇总证据、不同观点和未解问题，适合做主题调研。",
  },
  flashcard: {
    name: "记忆卡片",
    description: "生成问答卡片，方便间隔复习。",
  },
  compare: {
    name: "对比分析",
    description: "把概念、工具或方案并排比较，列出差异和适用场景。",
  },
  cheatsheet: {
    name: "速查表",
    description: "压缩成命令、语法和常用模式的快速参考。",
  },
  socratic: {
    name: "苏格拉底提问",
    description: "用连续追问带你自己想出答案，而不是直接给结论。",
  },
  cornell: {
    name: "康奈尔笔记",
    description: "按线索、笔记、总结三栏整理，方便复习。",
  },
  glossary: {
    name: "术语表",
    description: "把相关术语、定义和关系整理成结构化词表。",
  },
  debate: {
    name: "多角度辩论",
    description: "让正反双方各自最强地论证，暴露分歧点。",
  },
  howto: {
    name: "操作指南",
    description: "给出前置条件、分步骤操作和常见故障排查。",
  },
  mindmap: {
    name: "思维导图",
    description: "用层级关系画出一张概念地图。",
  },
  eli5: {
    name: "讲给小白",
    description: "用极简语言解释，假设读者完全没有背景。",
  },
  timeline: {
    name: "时间线",
    description: "按时间顺序梳理一个概念或技术的来龙去脉。",
  },
  "devils-advocate": {
    name: "魔鬼代言人",
    description: "专门挑假设和漏洞，压力测试你的观点。",
  },
  "project-breakdown": {
    name: "项目拆解",
    description: "把想法拆成阶段、任务和里程碑。",
  },
  "case-study": {
    name: "案例研究",
    description: "用真实案例复盘决策、结果和可迁移的经验。",
  },
  "question-generator": {
    name: "复习题",
    description: "围绕主题生成一组复习问题，附答案要点。",
  },
  "active-recall-prep": {
    name: "主动回忆",
    description: "把解释改写成挖空练习，逼自己回忆关键步骤。",
  },
  lesson: {
    name: "单课设计",
    description: "只讲一个最小知识点，配练习、速查卡和原始出处。",
  },
  "general-deep-article": {
    name: "深度长文",
    description: "面向任意主题写一篇有证据、有细节的长文。",
  },
  "further-reading": {
    name: "延伸阅读",
    description: "从入门到进阶整理书、视频、课程和文章。",
  },
};

export function modeDisplayName(mode: NoteMode): string {
  if (mode.custom) return mode.name;
  return MODE_COPY[mode.id]?.name ?? mode.name;
}

export function modeDisplayDescription(mode: NoteMode): string {
  if (mode.custom) return mode.description ?? "";
  return MODE_COPY[mode.id]?.description ?? mode.description ?? "";
}
