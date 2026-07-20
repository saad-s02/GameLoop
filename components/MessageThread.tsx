"use client";

import { ChatTurn } from "@/lib/chat/turns";
import { Constraint } from "@/lib/planning/schemas";
import { AssistantTurn } from "./AssistantTurn";
import { UserTurn } from "./UserTurn";

export function MessageThread({
  turns,
  onAnswer,
  onRetry,
}: {
  turns: ChatTurn[];
  onAnswer: (a: { constraints: Constraint[]; historyText: string }) => void;
  onRetry: () => void;
}) {
  if (turns.length === 0) return null;
  return (
    <ol aria-label="Conversation" className="flex list-none flex-col gap-5 p-0">
      {turns.map((t, i) => (
        <li key={t.id} className="flex flex-col gap-3">
          <UserTurn text={t.userText} />
          <AssistantTurn turn={t} isLive={i === turns.length - 1} onAnswer={onAnswer} onRetry={onRetry} />
        </li>
      ))}
    </ol>
  );
}
