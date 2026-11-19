import type { SupportedLanguage } from '../types/i18n';
import { removeMediaBlocks } from './mediaBlock';
import { findFormulaBlocks } from './aiFormulaExtractor';
import { greetingKind, greetingReply } from './shaheenGreeting';
import { quickAnswer } from './shaheenQuickApps';
import { browserMemory, type OfflineMemory } from './browserMemory';
import { offlineNote } from './shaheenMemory';
import {
  ApiError,
  isStaticHosting,
  requestApi,
  streamShaheenAgent,
  visitorId,
  voteShaheenArena,
  type ChatResponse,
} from './api';
import {
  CHAT_STORAGE_KEY,
  clearChatSession,
  DEFAULT_WELCOME_MESSAGE,
  isChatMessage,
  loadStoredChatSession,
  saveChatSession,
  type ChatMessage,
  type ShaheenProvider,
} from './chatStorage';
import {
  defaultFilenameFor,
  normalizeArtifactLanguage,
  verifyCodeSnippet,
} from './codeVerifier';
import type {
  ActiveArtifactContext,
  AgentAction,
  AgentArtifact,
  AgentAttachmentInput,
  AgentGroundingSource,
  AgentMode,
  AgentPlan,
  AgentReasoningDepth,
  AgentStep,
  ArenaBattleResult,
  ArenaVoteChoice,
  LabContextSnapshot,
} from '../types/shaheenAgent';

/** Visitor-facing response modes (engine ids are still accepted by the API but never shown). */
export type ShaheenModelChoice = 'auto' | 'fast' | 'deep' | 'council' | ShaheenProvider;
const TURN_LIMIT = 4000;

/**
 * Long answers (a full formula is often > 4000 chars) used to stop the history loop, so Shaheen lost
 * the whole conversation right after its most useful reply. Shorten them instead, keeping the
 * machine-readable formula block when there is one.
 */
export function compactTurn(text: string): string {
  if (text.length <= TURN_LIMIT) return text;
  // The visual-aid topics are disposable: drop them rather than leave a half-cut block behind.
  text = removeMediaBlocks(text).trimEnd();
  if (text.length <= TURN_LIMIT) return text;
  const spans = findFormulaBlocks(text);
  const span = spans.filter((s) => s.formula).pop() || spans.pop();
  const formula = span && text.slice(span.start, span.end);
  const tail = formula && formula.length <= 1800 ? `\n…\n${formula}` : '\n…';
  return text.slice(0, TURN_LIMIT - tail.length).trimEnd() + tail;
}

/** `busy`: the server asked to come back shortly (many visitors at once) and the store is retrying by itself. */
interface Snapshot {
  messages: ChatMessage[];
  isLoading: boolean;
  busy?: boolean;
  daysRemaining: number;
  expiresAt: number;
  agentEnabled: boolean;
  agentMode: AgentMode;
  reasoningDepth: AgentReasoningDepth;
  autoWebSearch: boolean;
  autoApplyActions: boolean;
}
/** Automatic retries when Shaheen answers "busy" (503 SHAHEEN_BUSY), honouring Retry-After. */
export const BUSY_RETRIES = 3;
const busyDelay = (error: ApiError, attempt: number) =>
  Math.min(30_000, (error.retryAfterMs ?? 4000 * 2 ** attempt)) * (0.8 + Math.random() * 0.4);
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
interface SendOptions {
  text: string; model: ShaheenModelChoice; language: SupportedLanguage;
  errorText: (error: unknown) => string;
}
export interface SendAgentOptions {
  text: string;
  language: SupportedLanguage;
  agentMode?: AgentMode;
  attachments?: (AgentAttachmentInput & { previewUrl?: string })[];
  labContext?: LabContextSnapshot;
  activeArtifact?: ActiveArtifactContext;
  onAction?: (action: AgentAction) => void;
  errorText: (error: unknown) => string;
}

const CODE_FENCE_RE = /```([a-zA-Z0-9_-]+)\n([\s\S]*?)```/g;
const IGNORED_BLOCK_LANGS = new Set(['sham-formula', 'sham-media', 'sham-tool', 'markdown', 'md', 'text', 'txt']);

function extractFallbackCodeArtifacts(text: string, lang: SupportedLanguage): AgentArtifact[] {
  const artifacts: AgentArtifact[] = [];
  let idx = 0;
  for (const m of text.matchAll(CODE_FENCE_RE)) {
    const rawLang = (m[1] || '').trim().toLowerCase();
    const code = (m[2] || '').trim();
    if (!code || code.length < 24 || IGNORED_BLOCK_LANGS.has(rawLang)) continue;
    if (rawLang === 'json' && /"concentrationPercent"|"pyramidNotes"/.test(code)) continue;
    const norm = normalizeArtifactLanguage(rawLang);
    const verification = verifyCodeSnippet(norm, code);
    idx += 1;
    artifacts.push({
      id: `art-inline-${Date.now()}-${idx}`,
      title: lang === 'ar' || lang === 'fa' ? `مكوّن برمجي (${norm.toUpperCase()}) #${idx}` : `${norm.toUpperCase()} Artifact #${idx}`,
      filename: defaultFilenameFor(norm, `${norm}-${idx}`),
      language: norm,
      summary: `${norm.toUpperCase()} · ${verification.metrics.lines} lines · ${verification.score}/100`,
      code,
      ...(norm === 'html' ? { previewHtml: code } : {}),
      runnable: norm === 'html' || norm === 'svg' || norm === 'mermaid' || norm === 'javascript',
      verification,
      createdAt: Date.now(),
    });
  }
  return artifacts.slice(0, 4);
}

/**
 * When the server cannot answer (no connection, server down, every engine busy or out of quota) Shaheen
 * answers from memory instead of an error. Not for a question the server refused (bad request, rate
 * limit…) or when the administration turned Shaheen off.
 */
export function canAnswerFromMemory(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true; // network failure, timeout, a non-JSON page
  if (error.code === 'SHAHEEN_DISABLED') return false;
  return error.status >= 500 || error.status === 408 || error.code === 'SHAHEEN_BUSY';
}

export function chatHistory(messages: ChatMessage[]) {
  const history: { role: 'user' | 'assistant'; text: string }[] = [];
  let size = 0;
  for (const message of [...messages].reverse()) {
    if (message.id === 'welcome' || message.kind === 'error' || message.id.startsWith('bot-err-') ||
      message.id.startsWith('err-') || message.id.startsWith('expired-notice-')) continue;
    const text = compactTurn(message.text.trim());
    if (!text || size + text.length > 16000 || history.length === 24) break;
    history.unshift({ role: message.role, text });
    size += text.length;
  }
  return history;
}

/** One synchronous owner for both chat surfaces: no effect-driven rebroadcast loops. */
export function createChatStore(request: typeof requestApi = requestApi, pause: typeof wait = wait, memory: OfflineMemory = browserMemory) {
  let snapshot: Snapshot | undefined;
  let controller: AbortController | undefined;
  let generation = 0;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = (): Snapshot =>
    snapshot ??= {
      ...loadStoredChatSession(),
      isLoading: false,
      agentEnabled: true,
      agentMode: 'agent',
      reasoningDepth: 'deep',
      autoWebSearch: true,
      autoApplyActions: false,
    };
  const publish = (next: Snapshot, persist = true) => {
    next = { ...next, messages: next.messages.slice(-200) };
    snapshot = next;
    if (persist) saveChatSession(next.messages);
    listeners.forEach((listener) => listener());
  };
  const syncStorage = (event: StorageEvent) => {
    // A full localStorage wipe also clears the conversation.
    if (event.key !== CHAT_STORAGE_KEY && event.key !== null) return;
    // Another open tab of the site merely saving its own chat used to abort the question in flight here,
    // so the answer silently never came. While waiting, only a real clear (key removed) cancels it.
    if (controller && event.key === CHAT_STORAGE_KEY && typeof event.newValue === 'string') return;
    controller?.abort(); generation++;
    publish({ ...getSnapshot(), ...loadStoredChatSession(), isLoading: false }, false);
  };
  const expire = () => {
    const current = getSnapshot();
    if (current.expiresAt <= Date.now()) {
      controller?.abort(); generation++;
      clearChatSession();
      publish({ ...current, ...loadStoredChatSession(), isLoading: false }, false);
    } else {
      const daysRemaining = Math.ceil((current.expiresAt - Date.now()) / 86400000);
      if (daysRemaining !== current.daysRemaining) publish({ ...current, daysRemaining }, false);
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const store = {
    getSnapshot,
    subscribe(listener: () => void) {
      expire();
      listeners.add(listener);
      if (listeners.size === 1) {
        if (typeof window !== 'undefined') window.addEventListener('storage', syncStorage);
        timer = setInterval(expire, 60000);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          if (typeof window !== 'undefined') window.removeEventListener('storage', syncStorage);
          clearInterval(timer);
        }
      };
    },
    setMessages(update: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])) {
      const current = getSnapshot();
      const messages = typeof update === 'function' ? update(current.messages) : update;
      if (messages !== current.messages) publish({ ...current, messages });
    },
    clear() {
      controller?.abort(); generation++;
      clearChatSession();
      publish({ ...getSnapshot(), ...loadStoredChatSession(), messages: [DEFAULT_WELCOME_MESSAGE], isLoading: false });
    },
    setAgentEnabled(enabled: boolean) {
      publish({ ...getSnapshot(), agentEnabled: enabled }, false);
    },
    setAgentMode(agentMode: AgentMode) {
      publish({ ...getSnapshot(), agentMode }, false);
    },
    setReasoningDepth(reasoningDepth: AgentReasoningDepth) {
      publish({ ...getSnapshot(), reasoningDepth }, false);
    },
    setAutoWebSearch(autoWebSearch: boolean) {
      publish({ ...getSnapshot(), autoWebSearch }, false);
    },
    setAutoApplyActions(autoApplyActions: boolean) {
      publish({ ...getSnapshot(), autoApplyActions }, false);
    },
    markActionApplied(messageId: string, actionId: string) {
      const current = getSnapshot();
      const messages = current.messages.map((m) =>
        m.id === messageId && m.agentActions
          ? { ...m, agentActions: m.agentActions.map((a) => (a.id === actionId ? { ...a, applied: true } : a)) }
          : m,
      );
      publish({ ...current, messages });
    },
    async voteArena(messageId: string, vote: ArenaVoteChoice) {
      const current = getSnapshot();
      const target = current.messages.find((m) => m.id === messageId);
      const battle = target?.arenaBattle;
      if (!battle || battle.userVote === vote) return;
      const prevVote = battle.userVote;
      const optimisticTotals = { ...(battle.voteTotals || { a: 0, b: 0, tie: 0, merged: 0 }) };
      if (prevVote && optimisticTotals[prevVote] > 0) optimisticTotals[prevVote] -= 1;
      optimisticTotals[vote] += 1;

      publish({
        ...current,
        messages: current.messages.map((m) =>
          m.id === messageId && m.arenaBattle
            ? { ...m, arenaBattle: { ...m.arenaBattle, userVote: vote, voteTotals: optimisticTotals } }
            : m,
        ),
      });

      if (isStaticHosting) return;
      try {
        const res = await voteShaheenArena({ battleId: battle.battleId, vote, prevVote });
        const latest = getSnapshot();
        publish({
          ...latest,
          messages: latest.messages.map((m) =>
            m.id === messageId && m.arenaBattle
              ? { ...m, arenaBattle: { ...m.arenaBattle, userVote: res.vote, voteTotals: res.voteTotals } }
              : m,
          ),
        });
      } catch {
        /* keep local vote intact */
      }
    },
    /** Re-asks the question behind a trailing error bubble (removes both, then sends again). */
    async retry(options: Omit<SendOptions, 'text'> & { useAgent?: boolean; labContext?: LabContextSnapshot; onAction?: (action: AgentAction) => void }) {
      const current = getSnapshot();
      const last = current.messages[current.messages.length - 1];
      if (current.isLoading || !last || last.kind !== 'error') return false;
      const userIndex = current.messages.length - 2;
      const question = current.messages[userIndex];
      if (!question || question.role !== 'user') return false;
      publish({ ...current, messages: current.messages.slice(0, userIndex) });
      if (options.useAgent) {
        return store.sendAgent({
          text: question.text,
          language: options.language,
          labContext: options.labContext,
          onAction: options.onAction,
          errorText: options.errorText,
        });
      }
      return store.send({ ...options, text: question.text });
    },
    async send(options: SendOptions) {
      expire();
      const current = getSnapshot();
      const text = options.text.trim();
      if (!text || text.length > 4000 || current.isLoading) return false;
      const timestamp = () => new Date().toLocaleTimeString(options.language, { hour: '2-digit', minute: '2-digit' });
      const id = (role: string) => `${role}-${Date.now()}-${++sequence}`;
      // A bare greeting is answered here: instant, identical on every site, and no AI quota spent on «هاي».
      const greeting = greetingKind(text);
      if (greeting) {
        publish({ ...current, messages: [...current.messages,
          { id: id('user'), role: 'user', text, timestamp: timestamp() },
          { id: id('bot'), role: 'assistant', text: greetingReply(greeting, options.language), timestamp: timestamp(),
            aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' } }] });
        return true;
      }
      // «تطبيقات شاهين السريعة»: a simple, complete task (alcohol dilution, oil amounts, oz↔ml, thanks…) is
      // calculated right here — instant, no queue, no AI quota — so the engines stay free for real questions.
      const quick = quickAnswer(text, options.language);
      if (quick) {
        publish({ ...current, messages: [...current.messages,
          { id: id('user'), role: 'user', text, timestamp: timestamp() },
          { id: id('bot'), role: 'assistant', text: quick.reply, timestamp: timestamp(),
            aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' } }] });
        return true;
      }
      if (isStaticHosting) return false;
      const token = ++generation;
      controller = new AbortController();
      publish({ ...current, isLoading: true,
        messages: [...current.messages, { id: id('user'), role: 'user', text, timestamp: timestamp() }] });
      const signal = controller.signal;
      const history = chatHistory(current.messages);
      try {
        // The anonymous visitor id travels in the body, not in a custom header: a custom header needs CORS approval,
        // and a server one deploy behind would then block every question from the GitHub Pages site.
        const body = JSON.stringify({ message: text, model: options.model, language: options.language,
          conversationHistory: history, visitorId: visitorId() });
        let data: ChatResponse | undefined;
        for (let attempt = 0; ; attempt++) {
          try {
            data = await request<ChatResponse>('/api/chat', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body,
            }, 58_000); // the server may queue a question for up to ~50 s before answering
            break;
          } catch (error) {
            // Many visitors at once: wait in line instead of showing an error (the server says how long).
            if (!(error instanceof ApiError && error.code === 'SHAHEEN_BUSY') || attempt >= BUSY_RETRIES || generation !== token) throw error;
            if (!getSnapshot().busy) publish({ ...getSnapshot(), busy: true }, false);
            await pause(busyDelay(error, attempt), signal);
            if (generation !== token) return false;
          }
        }
        if (generation !== token) return false;
        const message: ChatMessage = { id: id('bot'), role: 'assistant', text: data?.reply, timestamp: timestamp(),
          aiEngine: data?.engine };
        if (!message.text?.trim() || !isChatMessage(message)) throw new Error('Invalid chat response');
        publish({ ...getSnapshot(), messages: [...getSnapshot().messages, message], isLoading: false, busy: false });
        // «ذاكرة شاهين»: this browser keeps its opening questions for the day the server cannot be reached.
        if (!history.length && options.model !== 'council') memory.learn({ question: text, lang: options.language, mode: options.model, answer: message.text });
      } catch (error) {
        if (generation !== token) return false;
        const remembered = canAnswerFromMemory(error) ? await memory.recall(text, options.language).catch(() => undefined) : undefined;
        if (generation !== token) return false;
        if (remembered) {
          publish({ ...getSnapshot(), isLoading: false, busy: false, messages: [...getSnapshot().messages, {
            id: id('bot'), role: 'assistant', text: remembered.answer + offlineNote(options.language, remembered.exact), timestamp: timestamp(),
            aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' },
          }] });
          return true;
        }
        publish({ ...getSnapshot(), isLoading: false, busy: false, messages: [...getSnapshot().messages, {
          id: id('bot-err'), role: 'assistant', kind: 'error', text: options.errorText(error), timestamp: timestamp(),
        }] });
      } finally {
        if (generation === token) controller = undefined;
      }
      return true;
    },
    async sendAgent(options: SendAgentOptions) {
      expire();
      const current = getSnapshot();
      const text = options.text.trim();
      if (!text || text.length > 4000 || current.isLoading) return false;
      const timestamp = () => new Date().toLocaleTimeString(options.language, { hour: '2-digit', minute: '2-digit' });
      const id = (role: string) => `${role}-${Date.now()}-${++sequence}`;
      const hasAttachments = Boolean(options.attachments?.length);

      const modeToRun: AgentMode = options.agentMode || current.agentMode || 'agent';

      if (!hasAttachments && modeToRun === 'agent' && !options.activeArtifact) {
        const greeting = greetingKind(text);
        if (greeting) {
          publish({
            ...current,
            messages: [
              ...current.messages,
              { id: id('user'), role: 'user', text, timestamp: timestamp() },
              {
                id: id('bot'),
                role: 'assistant',
                text: greetingReply(greeting, options.language),
                timestamp: timestamp(),
                aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' },
              },
            ],
          });
          return true;
        }
        const quick = quickAnswer(text, options.language);
        if (quick && !options.labContext?.activeTab) {
          publish({
            ...current,
            messages: [
              ...current.messages,
              { id: id('user'), role: 'user', text, timestamp: timestamp() },
              {
                id: id('bot'),
                role: 'assistant',
                text: quick.reply,
                timestamp: timestamp(),
                aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' },
              },
            ],
          });
          return true;
        }
      }

      if (isStaticHosting) return false;
      const token = ++generation;
      controller = new AbortController();
      const signal = controller.signal;
      const history = chatHistory(current.messages);
      const userMsgId = id('user');
      const botMsgId = id('bot');

      const userAttachments = options.attachments?.map((a, idx) => ({
        id: `att-${Date.now()}-${idx}`,
        name: a.name,
        mimeType: a.mimeType,
        previewUrl: a.previewUrl,
      }));

      const initialBotMessage: ChatMessage = {
        id: botMsgId,
        role: 'assistant',
        text: '…',
        timestamp: timestamp(),
        isStreaming: true,
        agentMode: modeToRun,
        reasoningDepth: current.reasoningDepth,
        agentSteps: [],
        groundingSources: [],
        agentActions: [],
        artifacts: [],
        aiEngine: {
          id: modeToRun,
          name:
            options.language === 'ar' || options.language === 'fa'
              ? modeToRun === 'arena'
                ? 'الخبير شاهين · حلبة التنافس الذكية'
                : modeToRun === 'architect'
                  ? 'الخبير شاهين · استوديو الهندسة البرمجية'
                  : 'الخبير شاهين · الوكيل الذكي'
              : modeToRun === 'arena'
                ? 'Master Shahin · Arena AI Agent'
                : modeToRun === 'architect'
                  ? 'Master Shahin · Code Architect'
                  : 'Master Shahin · AI Agent',
          badge:
            options.language === 'ar' || options.language === 'fa'
              ? modeToRun === 'arena'
                ? '⚔️ حلبة شاهين'
                : modeToRun === 'architect'
                  ? '⚡ استوديو البرمجة'
                  : '🤖 الوكيل الذكي'
              : modeToRun === 'arena'
                ? '⚔️ Arena AI'
                : modeToRun === 'architect'
                  ? '⚡ Code Studio'
                  : '🤖 AI Agent',
          provider: 'shaheen',
        },
      };

      publish(
        {
          ...current,
          isLoading: true,
          messages: [
            ...current.messages,
            {
              id: userMsgId,
              role: 'user',
              text,
              timestamp: timestamp(),
              ...(userAttachments?.length ? { attachments: userAttachments } : {}),
            },
            initialBotMessage,
          ],
        },
        false,
      );

      let accumulatedText = '';
      let liveSteps: AgentStep[] = [];
      let liveSources: AgentGroundingSource[] = [];
      let liveActions: AgentAction[] = [];
      let livePlan: AgentPlan | undefined;
      let liveArtifacts: AgentArtifact[] = [];
      let liveArena: ArenaBattleResult | undefined;

      const updateBotMessage = (patch: Partial<ChatMessage>, persist = false) => {
        if (generation !== token) return;
        const snap = getSnapshot();
        const messages = snap.messages.map((m) => (m.id === botMsgId ? { ...m, ...patch } : m));
        publish({ ...snap, messages }, persist);
      };

      try {
        let streamError: { code: string; message: string } | undefined;

        await streamShaheenAgent(
          {
            message: text,
            language: options.language,
            agentMode: modeToRun,
            reasoningDepth: current.reasoningDepth,
            autoWebSearch: current.autoWebSearch,
            conversationHistory: history,
            attachments: options.attachments?.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
            labContext: options.labContext,
            activeArtifact: options.activeArtifact,
          },
          (event) => {
            if (generation !== token) return;
            switch (event.type) {
              case 'thought': {
                liveSteps = [
                  ...liveSteps,
                  {
                    id: event.stepId,
                    kind: 'thought',
                    label: options.language === 'ar' || options.language === 'fa' ? 'تحليل وتخطيط مخبري' : 'Lab Reasoning & Planning',
                    status: 'done',
                    detail: event.text,
                  },
                ];
                updateBotMessage({ agentSteps: liveSteps });
                break;
              }
              case 'plan': {
                livePlan = { goal: event.goal, tasks: event.tasks };
                updateBotMessage({ agentPlan: livePlan });
                break;
              }
              case 'artifact': {
                if (!liveArtifacts.some((a) => a.id === event.artifact.id)) {
                  liveArtifacts = [...liveArtifacts, event.artifact];
                  updateBotMessage({ artifacts: liveArtifacts });
                }
                break;
              }
              case 'arena_start': {
                liveArena = {
                  battleId: event.battleId,
                  contenders: [],
                  winner: 'tie',
                  judgeSummary: '',
                  synthesizedReply: '',
                  synthesizedArtifacts: [],
                };
                updateBotMessage({ arenaBattle: liveArena });
                break;
              }
              case 'arena_contender': {
                if (liveArena) {
                  liveArena = {
                    ...liveArena,
                    contenders: [...liveArena.contenders.filter((c) => c.id !== event.contender.id), event.contender],
                  };
                  updateBotMessage({ arenaBattle: liveArena });
                }
                break;
              }
              case 'arena_judge': {
                if (liveArena) {
                  liveArena = {
                    ...liveArena,
                    winner: event.winner,
                    judgeSummary: event.judgeSummary,
                  };
                  updateBotMessage({ arenaBattle: liveArena });
                }
                break;
              }
              case 'tool_call': {
                const isCode =
                  event.tool === 'generate_code_artifact' ||
                  event.tool === 'inspect_and_verify_code' ||
                  event.tool === 'plan_engineering_tasks' ||
                  event.tool === 'benchmark_solutions_matrix';
                const isArena = event.tool === 'arena_duel' || event.tool === 'arena_judge';
                liveSteps = [
                  ...liveSteps,
                  {
                    id: event.stepId,
                    kind:
                      event.tool === 'web_search'
                        ? 'web'
                        : event.tool === 'dispatch_app_action'
                          ? 'action'
                          : isArena
                            ? 'arena'
                            : isCode
                              ? 'code'
                              : 'tool',
                    tool: event.tool,
                    label: event.label,
                    status: 'running',
                    detail: event.detail,
                  },
                ];
                updateBotMessage({ agentSteps: liveSteps });
                break;
              }
              case 'tool_result': {
                liveSteps = liveSteps.map((s) =>
                  s.id === event.stepId
                    ? { ...s, status: event.status, detail: event.detail ?? s.detail, durationMs: event.durationMs }
                    : s,
                );
                updateBotMessage({ agentSteps: liveSteps });
                break;
              }
              case 'grounding': {
                liveSources = event.sources;
                updateBotMessage({ groundingSources: liveSources });
                break;
              }
              case 'action': {
                const actionObj = current.autoApplyActions ? { ...event.action, applied: true } : event.action;
                liveActions = [...liveActions, actionObj];
                updateBotMessage({ agentActions: liveActions });
                if (current.autoApplyActions && options.onAction) {
                  options.onAction(actionObj);
                }
                break;
              }
              case 'chunk': {
                accumulatedText += event.text;
                updateBotMessage({ text: accumulatedText });
                break;
              }
              case 'done': {
                const finalActions = event.actions.map((a) => {
                  const existing = liveActions.find((la) => la.id === a.id);
                  return existing ? { ...a, applied: existing.applied } : a;
                });
                const resolvedArtifacts =
                  event.artifacts && event.artifacts.length > 0
                    ? event.artifacts
                    : liveArtifacts.length > 0
                      ? liveArtifacts
                      : extractFallbackCodeArtifacts(event.reply, options.language);
                const snap = getSnapshot();
                const messages = snap.messages.map((m) =>
                  m.id === botMsgId
                    ? {
                        ...m,
                        text: event.reply,
                        agentSteps: event.steps,
                        groundingSources: event.sources,
                        agentActions: finalActions,
                        agentPlan: event.plan || livePlan,
                        artifacts: resolvedArtifacts,
                        arenaBattle: event.arena || liveArena,
                        aiEngine: event.engine,
                        isStreaming: false,
                      }
                    : m,
                );
                publish({ ...snap, messages, isLoading: false, busy: false }, true);
                if (!history.length && event.reply) {
                  memory.learn({ question: text, lang: options.language, mode: 'deep', answer: event.reply });
                }
                break;
              }
              case 'error': {
                streamError = { code: event.code, message: event.message };
                break;
              }
            }
          },
          signal,
          58_000,
        );

        if (streamError) {
          throw new ApiError(streamError.code === 'RATE_LIMITED' ? 429 : 503, streamError.code);
        }

        // Ensure streaming flag cleared if done event wasn't received for any reason
        const after = getSnapshot();
        const bot = after.messages.find((m) => m.id === botMsgId);
        if (bot?.isStreaming) {
          if (accumulatedText.trim()) {
            const messages = after.messages.map((m) =>
              m.id === botMsgId ? { ...m, text: accumulatedText.trim(), isStreaming: false } : m,
            );
            publish({ ...after, messages, isLoading: false, busy: false }, true);
          } else {
            throw new Error('Agent stream closed without final answer');
          }
        }
      } catch (error) {
        if (generation !== token) return false;
        const snap = getSnapshot();
        const withoutStreamingPlaceholder = snap.messages.filter((m) => m.id !== botMsgId);
        const remembered =
          !hasAttachments && canAnswerFromMemory(error)
            ? await memory.recall(text, options.language).catch(() => undefined)
            : undefined;
        if (generation !== token) return false;
        if (remembered) {
          publish({
            ...snap,
            isLoading: false,
            busy: false,
            messages: [
              ...withoutStreamingPlaceholder,
              {
                id: id('bot'),
                role: 'assistant',
                text: remembered.answer + offlineNote(options.language, remembered.exact),
                timestamp: timestamp(),
                aiEngine: { id: 'auto', name: 'الخبير شاهين', badge: 'شاهين', provider: 'shaheen' },
              },
            ],
          });
          return true;
        }
        publish({
          ...snap,
          isLoading: false,
          busy: false,
          messages: [
            ...withoutStreamingPlaceholder,
            {
              id: id('bot-err'),
              role: 'assistant',
              kind: 'error',
              text: options.errorText(error),
              timestamp: timestamp(),
            },
          ],
        });
      } finally {
        if (generation === token) controller = undefined;
      }
      return true;
    },
  };
  return store;
}
export const shaheenChatStore = createChatStore();
