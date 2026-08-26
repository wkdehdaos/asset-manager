"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { getCoaching } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AiCoachCard() {
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await getCoaching();
      setText(result.text);
      setSource(result.source);
    });
  }

  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-50 to-indigo-50 shadow-sm dark:from-violet-500/10 dark:to-indigo-500/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">AI 코칭</CardTitle>
          </div>
          {source && (
            <Badge variant={source === "ai" ? "info" : "secondary"}>
              {source === "ai" ? "AI" : "규칙 기반"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {text ? (
          <p className="text-sm leading-relaxed">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            지금 상황을 요약한 코칭을 받아보세요.
          </p>
        )}
        <Button size="sm" onClick={run} disabled={pending}>
          {pending ? "작성 중…" : text ? "다시 받기" : "코칭 받기"}
        </Button>
      </CardContent>
    </Card>
  );
}
