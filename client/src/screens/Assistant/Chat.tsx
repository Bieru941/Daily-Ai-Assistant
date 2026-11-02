import "./Chat.css";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenCheck,
  Bot,
  CalendarDays,
  ListTodo,
  Send,
  Sparkles,
  Target,
  UserRound,
  RotateCcw,
  AlertCircle,
  FileText,
  Paperclip,
  Search,
  X,
  MessagesSquare,
} from "lucide-react";

import { api } from "@/services/api";
import { SkeletonRows } from "@/components/common/Skeleton";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
};

type TextAttachment = {
  name: string;
  content: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messages: { id: string; role: string; content: string }[];
};

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 16 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024;
const SUPPORTED_FILE_TYPES = /\.(txt|md|csv|json)$/i;

const suggestions = [
  {
    icon: CalendarDays,
    title: "Plan my day",
    prompt: "Help me create a realistic daily schedule.",
  },
  {
    icon: BookOpenCheck,
    title: "Help me study",
    prompt: "Help me make a study plan and stay focused.",
  },
  {
    icon: ListTodo,
    title: "Organize my tasks",
    prompt: "Help me prioritize and organize my tasks.",
  },
  {
    icon: Target,
    title: "Reach my goals",
    prompt: "Help me set achievable goals and track my progress.",
  },
];

function createMessage(
  role: Message["role"],
  content: string,
  attachments?: string[],
): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    ...(attachments?.length ? { attachments } : {}),
  };
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const retryRequestRef = useRef<{ message: string; attachments: TextAttachment[] } | null>(null);

  async function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening || conversations.length || historyLoading) return;

    setHistoryLoading(true);
    setHistoryError("");
    try {
      setConversations(await api<ConversationSummary[]>("/conversations"));
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Could not load conversation history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openConversation(conversation: ConversationSummary) {
    const restoredMessages = conversation.messages.flatMap((message): Message[] => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      return [{
        id: message.id,
        role: message.role,
        content: message.content,
      }];
    });
    setConversationId(conversation.id);
    setMessages(restoredMessages);
    setAttachments([]);
    setText("");
    setError("");
    retryRequestRef.current = null;
    setHistoryOpen(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, busy]);

  async function send(value = text, attachedFiles = attachments) {
    const message = value.trim();

    if ((!message && !attachedFiles.length) || busy || readingFiles) return;

    setMessages((current) => [
      ...current,
      createMessage(
        "user",
        message || "Please review the attached file(s).",
        attachedFiles.map(file => file.name),
      ),
    ]);

    setBusy(true);
    setError("");

    try {
      const result = await api<{ answer: string; conversationId: string }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          attachments: attachedFiles.map(({ name, content }) => ({ name, content })),
          ...(conversationId ? { conversationId } : {}),
        }),
      });

      if (
        !result ||
        typeof result.answer !== "string" ||
        typeof result.conversationId !== "string"
      ) {
        throw new Error("The AI returned an invalid response.");
      }

      setConversationId(result.conversationId);
      setConversations([]);
      retryRequestRef.current = null;
      setText("");
      setAttachments([]);
      setMessages((current) => [
        ...current,
        createMessage("assistant", result.answer),
      ]);
    } catch (e) {
      retryRequestRef.current = { message, attachments: attachedFiles };
      setError(
        e instanceof Error
          ? e.message
          : "Unable to connect to the AI. Please try again.",
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function clearChat() {
    if (busy) return;

    setMessages([]);
    setConversationId(null);
    setError("");
    setText("");
    setAttachments([]);
    retryRequestRef.current = null;
    inputRef.current?.focus();
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const files = Array.from(fileList);
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Attach up to ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    if (files.some(file => !SUPPORTED_FILE_TYPES.test(file.name))) {
      setError("Choose text files only: .txt, .md, .csv, or .json.");
      return;
    }

    if (files.some(file => attachments.some(attachment => attachment.name === file.name))) {
      setError("A file with that name is already attached.");
      return;
    }

    if (files.some(file => file.size > MAX_ATTACHMENT_BYTES)) {
      setError("Each file must be 16 KB or smaller.");
      return;
    }

    setReadingFiles(true);
    try {
      const selected = await Promise.all(files.map(async file => ({
        name: file.name,
        content: await file.text(),
      })));
      const actualSizes = selected.map(file => new TextEncoder().encode(file.content).byteLength);
      if (actualSizes.some(size => size > MAX_ATTACHMENT_BYTES)) {
        setError("Each file must contain 16 KB or less of text.");
        return;
      }
      const allAttachments = [...attachments, ...selected];
      const totalBytes = allAttachments.reduce(
        (sum, file) => sum + new TextEncoder().encode(file.content).byteLength,
        0,
      );

      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        setError("Attachments must total 24 KB or less.");
        return;
      }

      if (selected.some(file => !file.content.trim())) {
        setError("Empty files can’t be attached.");
        return;
      }

      if (selected.some(file => /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(file.content))) {
        setError("The selected file contains binary data. Choose a plain text file.");
        return;
      }

      setAttachments(allAttachments);
      setError("");
    } catch {
      setError("Could not read the selected file. Try a plain text file.");
    } finally {
      setReadingFiles(false);
    }
  }

  function removeAttachment(name: string) {
    setAttachments(current => current.filter(file => file.name !== name));
  }

  return (
    <section className="chat-page">
      <div className="ai-chat">
        <div className="ai-chat-header">
            <div className="ai-brand">
              <div className="ai-brand-orb">
                <Bot size={23} strokeWidth={1.8} />
              </div>

              <div>
                <h2>Daymate</h2>
                <p className="ai-status">
                  <span className={`status-dot${error ? " is-error" : ""}${busy ? " is-busy" : ""}`} />
                  {error ? "Connection issue" : busy ? "Thinking through it..." : "Ready to help"}
                </p>
              </div>
            </div>

            <div className="ai-chat-header-actions">
              <button
                type="button"
                className="chat-clear-button"
                onClick={() => void toggleHistory()}
                disabled={busy}
                aria-expanded={historyOpen}
                aria-label={historyOpen ? "Close conversation history" : "Search conversation history"}
                title="Conversation history"
              >
                <MessagesSquare size={17} />
              </button>
              <button
                type="button"
                className="chat-clear-button"
                onClick={clearChat}
                disabled={busy || messages.length === 0}
                aria-label="Start a new conversation"
                title="New conversation"
              >
                <RotateCcw size={17} />
              </button>
            </div>
        </div>

        {historyOpen && (
          <div className="chat-history-panel" aria-label="Conversation history">
            <label className="chat-history-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={historySearch}
                onChange={event => setHistorySearch(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
              />
            </label>
            {historyLoading && <div role="status" aria-label="Loading conversations"><SkeletonRows count={4} /></div>}
            {historyError && <p className="chat-history-error" role="alert">{historyError}</p>}
            {!historyLoading && !historyError && (
              <div className="chat-history-list">
                {conversations
                  .filter(conversation => conversation.title.toLocaleLowerCase().includes(historySearch.trim().toLocaleLowerCase()))
                  .map(conversation => (
                    <button
                      type="button"
                      key={conversation.id}
                      className={`chat-history-item${conversationId === conversation.id ? " active" : ""}`}
                      onClick={() => openConversation(conversation)}
                    >
                      <strong>{conversation.title}</strong>
                      <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
                    </button>
                  ))}
                {!conversations.some(conversation => conversation.title.toLocaleLowerCase().includes(historySearch.trim().toLocaleLowerCase())) && (
                  <p className="chat-history-empty">{conversations.length ? "No conversations match your search." : "Your saved conversations will appear here."}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div
            className="ai-chat-messages"
            role="log"
            aria-label="Chat conversation"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 && (
              <div className="ai-welcome">
                <div className="welcome-orb">
                  <Sparkles size={32} />
                </div>

                <span className="welcome-eyebrow">
                  YOUR PERSONAL AI ASSISTANT
                </span>

                <h1>
                  Make today
                  <br />
                  <span>count.</span>
                </h1>

                <p className="welcome-description">
                  Need a plan, a little focus, or help reaching
                  your goals? Let's figure it out together.
                </p>

                <div className="ai-suggestions">
                  {suggestions.map((item) => (
                    <button
                      type="button"
                      className="ai-suggestion"
                      key={item.title}
                      onClick={() => void send(item.prompt)}
                      disabled={busy}
                    >

                      <span className="suggestion-copy">
                        <strong>{item.title}</strong>
                        <small>{item.prompt}</small>
                      </span>

                      <span className="suggestion-icon" aria-hidden="true">
                        <item.icon size={18} />
                      </span>
                      <span className="suggestion-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                className={`ai-message-row ${
                  message.role === "user" ? "is-user" : "is-assistant"
                }`}
                key={message.id}
              >
                <div
                  className={`message-avatar ${
                    message.role === "user"
                      ? "user-avatar"
                      : "assistant-avatar"
                  }`}
                  aria-hidden="true"
                >
                  {message.role === "user" ? (
                    <UserRound size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                </div>

                <div className="message-content">
                  <span className="message-author">
                    {message.role === "user" ? "You" : "Daymate"}
                  </span>

                  <div className="ai-message-bubble">
                    {message.content}
                  </div>
                  {message.attachments && (
                    <div className="ai-message-attachments">
                      {message.attachments.map((name, index) => (
                        <span className="ai-message-attachment" key={`${name}-${index}`}>
                          <FileText size={13} />
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="ai-message-row is-assistant">
                <div className="message-avatar assistant-avatar">
                  <Sparkles size={17} />
                </div>

                <div className="message-content">
                  <span className="message-author">Daymate</span>

                  <div
                    className="ai-typing"
                    role="status"
                    aria-label="AI is thinking"
                  >
                    <span />
                    <span />
                    <span />
                    <small>Thinking</small>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="ai-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>

                <button
                  type="button"
                  onClick={() => {
                    const lastMessage = messages[messages.length - 1];

                    if (lastMessage?.role === "user") {
                      const retry = retryRequestRef.current;
                      void send(
                        retry?.message ?? lastMessage.content,
                        retry?.attachments ?? [],
                      );
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            <div ref={bottomRef} />
        </div>

        <form
            className="ai-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {attachments.length > 0 && (
              <div className="ai-attachment-list" aria-label="Files attached to this message">
                {attachments.map(file => (
                  <span className="ai-attachment-chip" key={file.name}>
                    <FileText size={15} />
                    <span>{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      disabled={busy}
                      onClick={() => removeAttachment(file.name)}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="ai-composer-controls">
              <input
                ref={fileInputRef}
                className="ai-file-input"
                type="file"
                accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                multiple
                onChange={event => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
                aria-label="Attach text files"
              />
              <button
                type="button"
                className="ai-attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || readingFiles || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach files"
                title="Attach text files (TXT, Markdown, CSV, JSON)"
              >
                <Paperclip size={19} />
              </button>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Message your AI assistant..."
              aria-label="Message your AI assistant"
              rows={1}
              maxLength={10000}
              disabled={busy}
              onPaste={event => {
                const pastedFiles = event.clipboardData.files;
                if (pastedFiles.length) {
                  event.preventDefault();
                  void addFiles(pastedFiles);
                }
              }}
            />

            <button
              type="submit"
              className="ai-send-button"
              disabled={busy || readingFiles || (!text.trim() && !attachments.length)}
              aria-label="Send message"
              title="Send message"
            >
              <Send size={19} />
            </button>
            </div>
            <p className="composer-hint">
              Text files only · up to 3 files, 24 KB total · Enter to send
            </p>
        </form>
      </div>
    </section>
  );
}
