import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";

export default function Timer() {
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [durationInput, setDurationInput] = useState("25");
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState("");
  const completed = useRef(false);

  const saveSession = useCallback(async () => {
    setRecording(true);
    setError("");

    try {
      await api("/study-sessions", {
        method: "POST",
        body: JSON.stringify({ subject: "Study session", minutes: durationMinutes }),
      });
      setRecorded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save study session.");
    } finally {
      setRecording(false);
    }
  }, [durationMinutes]);

  function updateDuration(value: string) {
    setDurationInput(value);
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;

    setDurationMinutes(minutes);
    setSeconds(minutes * 60);
    setRunning(false);
    completed.current = false;
    setRecorded(false);
    setError("");
  }

  function resetTimer() {
    setRunning(false);
    setDurationInput(String(durationMinutes));
    setSeconds(durationMinutes * 60);
    completed.current = false;
    setRecorded(false);
    setError("");
  }

  useEffect(() => {
    if (!running) return;

    const id = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(id);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (seconds === 0 && !completed.current) {
      completed.current = true;
      void saveSession();
    }
  }, [seconds, saveSession]);

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const enteredDuration = Number(durationInput);
  const durationIsValid =
    Number.isInteger(enteredDuration) && enteredDuration >= 1 && enteredDuration <= 1440;

  return (
    <div className="timer">
      <label className="timer-duration">
        Duration (minutes)
        <input
          type="number"
          min="1"
          max="1440"
          step="1"
          value={durationInput}
          disabled={running || recording}
          onChange={(event) => updateDuration(event.target.value)}
        />
      </label>
      <strong>{time}</strong>
      {recording && <small role="status">Saving your study session...</small>}
      {recorded && <small role="status">Study session saved.</small>}
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" className="secondary" onClick={() => void saveSession()}>
            Retry
          </button>
        </p>
      )}
      <div>
        <button
          className="secondary"
          disabled={recording || seconds === 0 || !durationIsValid}
          onClick={() => setRunning(!running)}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          className="secondary"
          disabled={recording}
          onClick={resetTimer}
        >
          Reset
        </button>
      </div>
    </div>
  );
}