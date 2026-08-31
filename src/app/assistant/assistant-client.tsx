"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { chatWithBanker, type BankerMessage } from "@/app/actions";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  greeting?: boolean;
}

const GREETING =
  "안녕하세요! 저는 1억 모으기를 도와드릴 AI 금융비서 머니예요 🤖\n수입이 바뀌었거나 계획을 조정하고 싶을 때, 편하게 말로 알려주세요. 제가 로드맵을 바로 손봐드릴게요!";

const SUGGESTIONS = [
  "이번 달 과외 끊겨서 30만원 적게 모을 것 같아",
  "청년미래적금 2차 가입 조건이 뭐였지?",
  "9월에 '중고거래 정리' 미션 추가해줘",
  "이번 달 저축 다 완료했어!",
];

export function AssistantClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: GREETING, greeting: true },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    // 인사말(index 0) 제외한 실제 대화만 히스토리로 전달.
    const history: BankerMessage[] = next
      .filter((m) => !m.greeting)
      .map((m) => ({ role: m.role, content: m.content }));
    startTransition(async () => {
      const res = await chatWithBanker(history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, actions: res.actions },
      ]);
      if (res.actions.length > 0) router.refresh(); // 로드맵·월별에 반영
    });
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      {/* 대화 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="flex gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-base">
                🤖
              </div>
              <div className="max-w-[80%]">
                <div className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                  AI 금융비서 머니
                </div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card border px-3 py-2 text-sm">
                  {m.content}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {m.actions.map((a, j) => (
                      <div
                        key={j}
                        className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        ✅ {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            </div>
          ),
        )}
        {pending && (
          <div className="flex gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-base">
              🤖
            </div>
            <div className="rounded-2xl rounded-tl-sm border bg-card px-3 py-2 text-sm text-muted-foreground">
              머니가 입력 중…
            </div>
          </div>
        )}
      </div>

      {/* 추천 질문 (대화 초반에만) */}
      {messages.length <= 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-input bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 입력 */}
      <div className="flex items-center gap-2 border-t pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="예: 이번 달 저축 목표 낮춰줘"
          disabled={pending}
          className={cn(
            "h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <button
          type="button"
          onClick={() => send(input)}
          disabled={pending || !input.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="보내기"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
