import {
  clearSymptomThread,
  readSymptomHistory,
  runSymptomChat,
  type AgentMessageInput,
  type ConversationEntry,
} from '../../ai/agents.js';
import { isModelConfigured, defaultChatModel } from '../../ai/models.js';
import { AppError } from '../../middleware/error.js';

export interface SymptomAiContext {
  accountId: string;
  patientId: string;
  symptomId: string;
  includeRecords: boolean;
  modifyHistory: boolean;
  model: string;
  requestId?: string;
}

export interface SymptomAi {
  isConfigured(): boolean;
  invoke(context: SymptomAiContext, input: AgentMessageInput): Promise<ConversationEntry[]>;
  history(threadId: string): Promise<ConversationEntry[]>;
  clear(threadId: string): Promise<void>;
}

export const defaultSymptomAi: SymptomAi = {
  isConfigured() {
    return isModelConfigured(defaultChatModel());
  },

  async invoke(context, input) {
    if (!isModelConfigured(context.model)) {
      throw new AppError(503, 'AI provider is not configured', 'ai_unavailable');
    }
    return runSymptomChat(context, input);
  },

  history(threadId) {
    return readSymptomHistory(threadId);
  },

  clear(threadId) {
    return clearSymptomThread(threadId);
  },
};
