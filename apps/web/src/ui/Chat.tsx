import { CHAT_MAX_CHARS } from '@doodle/sim';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { team, teamGlyph } from '../game/art/palette';
import { isTouch } from '../game/device';
import { hud, useStore } from '../game/store';
import { chat, session, type ShownLine } from '../net/online';

/** How long a line stays in the battle feed, and how many it shows at once. */
const FEED_MS = 8000;
const FEED_LINES = 4;

/**
 * How the focused element got its focus: from the keyboard (Tab) or from a click or tap. :focus-visible
 * can't tell: Chrome starts matching it on a clicked button as soon as a key goes down on it.
 */
let keyboardLast = false;
let focusedBy: { el: EventTarget | null; keyboard: boolean } = { el: null, keyboard: false };
window.addEventListener('keydown', () => (keyboardLast = true), true);
window.addEventListener('pointerdown', () => (keyboardLast = false), { capture: true, passive: true });
window.addEventListener('focusin', (e) => (focusedBy = { el: e.target, keyboard: keyboardLast }), true);

/**
 * Whether this Enter is free to open the chat. It isn't if it's typed into a field, held down, finishing an
 * IME composition or pressed with a modifier, or if it's meant for a button the player moved to with the
 * keyboard. A button that only has focus because it was clicked doesn't count: Enter would press it again.
 */
function enterIsFree(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.repeat || e.isComposing) return false;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
    return false;
  return !el.isContentEditable && focusedBy.el === el && !focusedBy.keyboard;
}

/** Opens the chat on Enter, when Enter isn't meant for anything else and `blocked` says nothing's in the way. */
function useEnterToChat(open: () => void, blocked: () => boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enterIsFree(e) || blocked()) return;
      // Also keeps a clicked button from being pressed again.
      e.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

function Line({ line, age }: { line: ShownLine; age?: number }) {
  const who = line.name && (
    <b style={{ color: team(line.team).color }}>
      {teamGlyph(line.team)} {line.name}
      {line.system ? '' : ':'}
    </b>
  );
  return (
    <div
      className={`chat-line ${line.system ? 'system' : ''}`}
      // The feed fades each line on its own clock, even when the feed is drawn afresh.
      style={age === undefined ? undefined : { animationDelay: `${-age}ms` }}
    >
      {who} {line.text}
    </div>
  );
}

/** The whole log, kept scrolled to the newest line unless the player scrolled up to read. */
function ChatLog({ lines, live, empty }: { lines: ShownLine[]; live: boolean; empty: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);
  // And when the log itself changes size: typing on a phone shrinks it to stay above the keyboard.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div
      className="chat-log"
      ref={ref}
      role="log"
      aria-live={live ? 'polite' : 'off'}
      aria-label="Chat"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {lines.length === 0 ? (
        <p className="chat-empty">{empty}</p>
      ) : (
        lines.map((l) => <Line key={l.id} line={l} />)
      )}
    </div>
  );
}

interface FormProps {
  inputRef: RefObject<HTMLInputElement | null>;
  draft: string;
  setDraft(text: string): void;
  placeholder: string;
  /** Hidden but still focusable, so a tap on 💬 can bring the phone keyboard up. */
  hidden?: boolean;
  /** After Enter or Send, whether or not anything went. */
  onSubmitted?(): void;
  /** Shows a ✕ that closes the chat. */
  onCancel?(): void;
  onOpen(): void;
  onClose(): void;
}

/** Stops a button from taking the focus, and with it the phone keyboard, away from the field. */
const keepFocus = {
  onPointerDown: (e: { preventDefault(): void }) => e.preventDefault(),
  onMouseDown: (e: { preventDefault(): void }) => e.preventDefault(),
};

function ChatForm(props: FormProps) {
  const { inputRef, draft, setDraft, placeholder, hidden, onSubmitted, onCancel, onOpen, onClose } = props;
  const tab = hidden ? -1 : 0;
  return (
    <form
      className="chat-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (session.sendChat(draft)) setDraft('');
        onSubmitted?.();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={CHAT_MAX_CHARS}
        placeholder={placeholder}
        aria-label="Chat message"
        enterKeyHint="send"
        autoComplete="off"
        tabIndex={tab}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={onOpen}
        onKeyDown={(e) => {
          // The Enter that finishes an IME composition picks the word; it doesn't send. Safari reports
          // that key as 229 without marking it as composing.
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
          if (e.key === 'Escape') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <button type="submit" className="btn small chat-send" tabIndex={tab} {...keepFocus}>
        Send
      </button>
      {onCancel && (
        <button
          type="button"
          className="btn small chat-close"
          tabIndex={tab}
          aria-label="Close chat"
          title="Close (Esc)"
          {...keepFocus}
          onClick={onCancel}
        >
          ✕
        </button>
      )}
    </form>
  );
}

/** Marks the chat closed when its view goes, so unread lines count again. */
function useClosedOnLeave(): void {
  useEffect(() => () => chat.set({ open: false }), []);
}

/** The room's chat in the lobby: always open, beside the stage card, or under the header on touch screens. */
export function LobbyChat() {
  const lines = useStore(chat, (s) => s.lines);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEnterToChat(
    () => inputRef.current?.focus(),
    () => false,
  );
  // The log is in view here, so nothing counts as unread when the match starts.
  useEffect(() => chat.set({ unread: 0 }), [lines]);
  useClosedOnLeave();
  return (
    <div className="lobby-chat" ref={boxRef}>
      <div className="section-title">Chat</div>
      <ChatLog lines={lines} live empty="Say hi! Messages show up here, and over your doodle in battle." />
      <ChatForm
        inputRef={inputRef}
        draft={draft}
        setDraft={setDraft}
        placeholder={isTouch ? 'Say something…' : 'Say something… (Enter)'}
        onOpen={() => {
          chat.set({ open: true, unread: 0 });
          // Up to the top of the card, where the phone keyboard can't cover it.
          if (isTouch) boxRef.current?.scrollIntoView({ block: 'start' });
        }}
        onClose={() => chat.set({ open: false })}
      />
    </div>
  );
}

/** The lines from the last few seconds, and a re-render when the oldest of them is due to go. */
function useFeed(lines: ShownLine[]): { feed: ShownLine[]; now: number } {
  const [, setTick] = useState(0);
  const now = performance.now();
  const feed = lines.filter((l) => l.at > 0 && now - l.at < FEED_MS).slice(-FEED_LINES);
  const due = feed.length ? Math.min(...feed.map((l) => l.at + FEED_MS)) - now : null;
  useEffect(() => {
    if (due === null) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), due + 30);
    return () => window.clearTimeout(id);
  });
  return { feed, now };
}

/** On a touch screen, calls `gone` if the keyboard goes away while the chat is open. */
function useKeyboardGone(open: boolean, gone: () => void): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !isTouch || !vv) return;
    let up = false;
    const onResize = () => {
      if (vv.height < document.documentElement.clientHeight * 0.8) up = true;
      // Android's back button hides the keyboard but leaves the field focused.
      else if (up) gone();
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [open, gone]);
}

/**
 * The chat in battle, under the turn queue: the latest lines for a few seconds, a 💬 button, and the log
 * with a field while it's open. Each line also shows in a bubble over its sender's doodle.
 */
export function BattleChat() {
  const lines = useStore(chat, (s) => s.lines);
  const unread = useStore(chat, (s) => s.unread);
  // Open while the field has focus. Kept here rather than read from the store, which the lobby's field
  // may have left set: a field taken out of the page while focused gets no blur.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { feed, now } = useFeed(lines);

  const focus = useCallback(() => inputRef.current?.focus(), []);
  const close = useCallback(() => inputRef.current?.blur(), []);
  useClosedOnLeave();
  // Not over the pause menu, where Enter means Resume.
  useEnterToChat(focus, () => hud.get().paused);
  useKeyboardGone(open, close);

  // A tap on the battlefield closes the chat: the canvas takes no focus, so the field wouldn't lose it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  // While typing on a touch screen, the controls under the keyboard step aside, and so does the queue.
  useEffect(() => {
    if (!open || !isTouch) return;
    document.body.classList.add('chat-typing');
    return () => document.body.classList.remove('chat-typing');
  }, [open]);

  return (
    <div className={`chat ${open ? 'open interactive' : ''}`} ref={rootRef}>
      {!open && (
        <button
          className="btn icon chat-toggle interactive"
          title="Chat (Enter)"
          aria-label={unread > 0 ? `Chat, ${unread} new` : 'Chat'}
          {...keepFocus}
          onClick={focus}
        >
          💬
          {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
      {open ? (
        <div className="chat-panel sheet">
          <ChatLog lines={lines} live={false} empty="No messages yet. Say hi!" />
        </div>
      ) : (
        <div className="chat-feed" role="log" aria-live="polite" aria-label="Chat">
          {feed.map((l) => (
            <Line key={l.id} line={l} age={now - l.at} />
          ))}
        </div>
      )}
      <ChatForm
        inputRef={inputRef}
        draft={draft}
        setDraft={setDraft}
        placeholder={isTouch ? 'Say something…' : 'Say something… (Esc to close)'}
        hidden={!open}
        // Back to the game straight after, so the next arrow or Space moves the doodle.
        onSubmitted={close}
        onCancel={close}
        onOpen={() => {
          setOpen(true);
          chat.set({ open: true, unread: 0 });
        }}
        onClose={() => {
          setOpen(false);
          chat.set({ open: false });
        }}
      />
    </div>
  );
}
