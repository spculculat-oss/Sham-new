import { useSyncExternalStore } from 'react';
import { shaheenChatStore } from '../utils/chatStore';

/** Both Shaheen surfaces (floating window + lab page) share this one store, so they never diverge. */
export function useShaheenChat() {
  const state = useSyncExternalStore(
    shaheenChatStore.subscribe,
    shaheenChatStore.getSnapshot,
    shaheenChatStore.getSnapshot,
  );
  return {
    ...state,
    setMessages: shaheenChatStore.setMessages,
    sendMessage: shaheenChatStore.send,
    sendAgentMessage: shaheenChatStore.sendAgent,
    setAgentEnabled: shaheenChatStore.setAgentEnabled,
    setAgentMode: shaheenChatStore.setAgentMode,
    setReasoningDepth: shaheenChatStore.setReasoningDepth,
    setAutoWebSearch: shaheenChatStore.setAutoWebSearch,
    setAutoApplyActions: shaheenChatStore.setAutoApplyActions,
    markActionApplied: shaheenChatStore.markActionApplied,
    voteArena: shaheenChatStore.voteArena,
    retryLast: shaheenChatStore.retry,
    clearHistory: shaheenChatStore.clear,
  };
}
