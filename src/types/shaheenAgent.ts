import type { ExtractedAIPerfume } from '../utils/aiFormulaExtractor';
import type { ToolLink } from '../utils/shaheenTools';
import type { SupportedLanguage } from './i18n';

export type AgentReasoningDepth = 'standard' | 'deep' | 'max';

export interface AgentStep {
  id: string;
  kind: 'thought' | 'tool' | 'web' | 'action';
  tool?: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
  durationMs?: number;
}

export interface AgentGroundingSource {
  title: string;
  uri: string;
}

export type AgentActionType =
  | 'apply_formula'
  | 'apply_pyramid'
  | 'save_recipe'
  | 'calculate_costing'
  | 'print_spec_sheet'
  | 'open_tool';

export interface AgentAction {
  id: string;
  type: AgentActionType;
  label: string;
  formula?: ExtractedAIPerfume;
  toolLink?: ToolLink;
  applied?: boolean;
}

export interface AgentAttachmentInput {
  name: string;
  mimeType: string;
  data: string;
}

export interface ChatAttachmentPreview {
  id: string;
  name: string;
  mimeType: string;
  previewUrl?: string;
}

export interface LabContextSnapshot {
  activeTab?: string;
  formulaTitle?: string;
  formulation?: {
    bottleVolumeMl: number;
    batchCount: number;
    concentrationPercent: number;
    concentrationType: string;
    alcoholPercentage: number;
    waterPercent: number;
    fixativePercent: number;
    unitMode: string;
  };
  pyramidNotes?: {
    nameAr: string;
    nameEn?: string;
    category: 'top' | 'heart' | 'base';
    percentageOfOil: number;
  }[];
  macerationDays?: number;
  savedCount?: number;
  currencyCode?: string;
  countryName?: string;
}

export interface AgentRequestPayload {
  message: string;
  language: SupportedLanguage;
  reasoningDepth?: AgentReasoningDepth;
  autoWebSearch?: boolean;
  conversationHistory?: { role: 'user' | 'assistant'; text: string }[];
  attachments?: AgentAttachmentInput[];
  labContext?: LabContextSnapshot;
  visitorId?: string;
}

export type AgentStreamEvent =
  | { type: 'status'; phase: string }
  | { type: 'thought'; stepId: string; text: string }
  | { type: 'tool_call'; stepId: string; tool: string; label: string; detail?: string }
  | { type: 'tool_result'; stepId: string; tool: string; status: 'done' | 'error'; detail?: string; durationMs?: number }
  | { type: 'grounding'; sources: AgentGroundingSource[] }
  | { type: 'action'; action: AgentAction }
  | { type: 'chunk'; text: string }
  | {
      type: 'done';
      reply: string;
      steps: AgentStep[];
      sources: AgentGroundingSource[];
      actions: AgentAction[];
      engine: {
        id: string;
        name: string;
        badge: string;
        provider: 'shaheen';
        accentColor: string;
      };
    }
  | { type: 'error'; code: string; message: string };
