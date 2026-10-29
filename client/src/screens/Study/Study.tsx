import { BookOpen } from "lucide-react";
import Card from "@/components/common/Card";
import Timer from "@/screens/Study/components/Timer";
import type { NavigationPage } from "@/navigation/types";

export default function Study({ go }: { go: (page: NavigationPage) => void }) {
  return (
    <section>
      <div className="grid two">
        <Card title="AI Tutor">
          <BookOpen />
          <p>Get help with Mathematics, Physics, Chemistry, Biology, English, and Programming.</p>
          <button className="primary" onClick={() => go("AI Assistant")}>Open AI Assistant</button>
        </Card>
        <Card title="Focus Mode">
          <p>Choose a focus duration, then take a break when the timer ends.</p>
          <Timer />
        </Card>
      </div>
    </section>
  );
}