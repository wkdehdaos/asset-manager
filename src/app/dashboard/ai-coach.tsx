"use client";

import { useState, useTransition } from "react";
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
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>AI 코칭</CardTitle>
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
        <Button variant="outline" size="sm" onClick={run} disabled={pending}>
          {pending ? "작성 중…" : text ? "다시 받기" : "코칭 받기"}
        </Button>
      </CardContent>
    </Card>
  );
}
