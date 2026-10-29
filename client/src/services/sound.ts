const SOUND_ENABLED_KEY = "daily-ai-sound-enabled";
const ALERTED_REMINDERS_KEY = "daily-ai-alerted-reminders";
const ALERT_WINDOW_MS = 2 * 60 * 1000;

type ReminderSoundInput = {
  id: string;
  remindAt: string;
  recurrence?: string;
};
type QuietHours = { enabled: boolean; start: string; end: string };

let audioContext: AudioContext | null = null;
const alertedReminders = new Set<string>();
let quietHours: QuietHours = { enabled: false, start: "22:00", end: "08:00" };

export function setQuietHours(value: QuietHours) {
  quietHours = value;
}

function isQuietHours(now = Date.now()) {
  if (!quietHours.enabled) return false;
  const minutesOfDay = (value: string) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const start = minutesOfDay(quietHours.start);
  const end = minutesOfDay(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const currentDate = new Date(now);
  const current = currentDate.getHours() * 60 + currentDate.getMinutes();
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

function getAudioContext() {
  if (!audioContext && typeof window !== "undefined" && window.AudioContext) {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

export function isSoundEnabled() {
  try {
    return window.localStorage.getItem(SOUND_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  window.dispatchEvent(new Event("daily-ai-sound-change"));
}

export function unlockSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => {});
  }
}

export function playSound(kind: "task-complete" | "reminder", force = false) {
  if (!isSoundEnabled() || (!force && isQuietHours())) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => {});

  const notes = kind === "reminder"
    ? [{ frequency: 740, at: 0 }, { frequency: 880, at: 0.2 }, { frequency: 740, at: 0.4 }]
    : [{ frequency: 660, at: 0 }, { frequency: 880, at: 0.13 }];

  for (const note of notes) {
    const start = context.currentTime + note.at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.19);
  }
}

function readAlertedReminders() {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(ALERTED_REMINDERS_KEY) || "[]"
    );
    if (Array.isArray(stored)) {
      for (const key of stored) {
        if (typeof key === "string") alertedReminders.add(key);
      }
    }
  } catch {
    // The in-memory set still prevents duplicate alerts for this app session.
  }
}

function saveAlertedReminder(key: string) {
  alertedReminders.add(key);
  try {
    window.localStorage.setItem(
      ALERTED_REMINDERS_KEY,
      JSON.stringify([...alertedReminders].slice(-500))
    );
  } catch {
    // Keep the in-memory marker when persistent browser storage is unavailable.
  }
}

export function alertDueReminders(
  reminders: ReminderSoundInput[],
  now = Date.now()
) {
  readAlertedReminders();

  for (const reminder of reminders) {
    const baseTime = new Date(reminder.remindAt).getTime();
    if (!Number.isFinite(baseTime) || baseTime > now) continue;

    const interval = reminder.recurrence === "DAILY"
      ? 24 * 60 * 60 * 1000
      : reminder.recurrence === "WEEKLY"
        ? 7 * 24 * 60 * 60 * 1000
        : 0;
    const occurrence = interval
      ? baseTime + Math.floor((now - baseTime) / interval) * interval
      : baseTime;
    if (now - occurrence > ALERT_WINDOW_MS) continue;

    const key = `${reminder.id}:${occurrence}`;
    if (alertedReminders.has(key)) continue;
    saveAlertedReminder(key);
    playSound("reminder");
  }
}
