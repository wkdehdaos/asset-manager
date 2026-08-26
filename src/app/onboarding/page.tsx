"use client";

import { useMemo, useState, useTransition } from "react";
import {
  diagnoseGoal,
  monthsBetween,
  requiredMonthlySaving,
  suggestAlternatives,
} from "@/core/goal-engine";
import type { GoalInput } from "@/core/types";
import { saveOnboarding } from "@/app/actions";
import { formatPct, formatWon, formatWonKorean, parseWon } from "@/lib/format";
import { FEASIBILITY_META } from "@/lib/ui-meta";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/** 오늘로부터 n년 뒤 날짜를 YYYY-MM-DD로. */
function isoYearsFromNow(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export default function OnboardingPage() {
  const [monthlyNet, setMonthlyNet] = useState("3500000");
  const [annualBonus, setAnnualBonus] = useState("5000000");
  const [targetAmount, setTargetAmount] = useState("100000000");
  const [currentAssets, setCurrentAssets] = useState("20000000");
  const [targetDate, setTargetDate] = useState(isoYearsFromNow(3));
  const [returnPct, setReturnPct] = useState("5");
  const [title, setTitle] = useState("3년 내 1억 만들기");
  const [pending, startTransition] = useTransition();

  // 실시간 진단 — 입력이 바뀔 때마다 core 엔진으로 재계산 (LLM 아님)
  const result = useMemo(() => {
    const today = new Date();
    const net = parseWon(monthlyNet);
    const goal: GoalInput = {
      targetAmount: parseWon(targetAmount),
      targetDate: new Date(targetDate),
      currentAssets: parseWon(currentAssets),
      expectedAnnualReturn: (Number(returnPct) || 0) / 100,
    };

    const months = monthsBetween(today, goal.targetDate);
    const validDate = !Number.isNaN(goal.targetDate.getTime()) && months > 0;
    if (!validDate || goal.targetAmount <= 0 || net <= 0) {
      return { valid: false as const, months };
    }

    const required = requiredMonthlySaving(
      goal.targetAmount,
      goal.currentAssets,
      goal.expectedAnnualReturn,
      months,
    );
    // 온보딩 시점엔 지출 이력이 없으므로 '실수령액 전액 저축'을 상한으로 두고
    // 실현가능성을 판정한다. 실제 저축여력은 대시보드에서 지출 반영 후 갱신.
    const diagnosis = diagnoseGoal(goal, net, today);
    const alternatives =
      diagnosis.feasibility.grade === "unrealistic" || !diagnosis.onTrack
        ? suggestAlternatives(goal, net, today)
        : null;
    const savingRatio = net > 0 ? required / net : 0;

    return {
      valid: true as const,
      months,
      required,
      diagnosis,
      alternatives,
      savingRatio,
    };
  }, [monthlyNet, targetAmount, currentAssets, targetDate, returnPct]);

  function handleSubmit() {
    startTransition(async () => {
      await saveOnboarding({
        monthlyNet: parseWon(monthlyNet),
        annualBonus: parseWon(annualBonus),
        targetAmount: parseWon(targetAmount),
        targetDate,
        currentAssets: parseWon(currentAssets),
        expectedAnnualReturn: (Number(returnPct) || 0) / 100,
        title,
      });
    });
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">목표를 세워볼까요</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        입력하는 즉시 필요한 월 저축액과 실현가능성을 계산해 드립니다.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>금액은 원 단위로 입력하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="title"
            label="목표 이름"
            value={title}
            onChange={setTitle}
            type="text"
          />
          <MoneyField
            id="monthlyNet"
            label="월 실수령액"
            value={monthlyNet}
            onChange={setMonthlyNet}
          />
          <MoneyField
            id="annualBonus"
            label="연간 상여 (선택)"
            value={annualBonus}
            onChange={setAnnualBonus}
          />
          <MoneyField
            id="targetAmount"
            label="목표 금액"
            value={targetAmount}
            onChange={setTargetAmount}
          />
          <MoneyField
            id="currentAssets"
            label="현재 자산"
            value={currentAssets}
            onChange={setCurrentAssets}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="targetDate">목표일</Label>
              <Input
                id="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="returnPct">기대 연수익률 (%)</Label>
              <Input
                id="returnPct"
                type="number"
                step="0.1"
                value={returnPct}
                onChange={(e) => setReturnPct(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 실시간 결과 */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>진단</CardTitle>
        </CardHeader>
        <CardContent>
          {!result.valid ? (
            <p className="text-sm text-muted-foreground">
              목표 금액·목표일(미래)·월 실수령액을 입력하면 진단이 표시됩니다.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">
                    필요 월 저축액 · {result.months}개월
                  </div>
                  <div className="text-3xl font-bold">
                    {formatWon(result.required)}
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      원
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    실수령액의 {formatPct(result.savingRatio, 0)} · 목표{" "}
                    {formatWonKorean(parseWon(targetAmount))}
                  </div>
                </div>
                <FeasibilityBadge grade={result.diagnosis.feasibility.grade} />
              </div>

              <p className="rounded-md bg-muted p-3 text-sm">
                {result.diagnosis.feasibility.message}
              </p>

              {result.alternatives && (
                <div>
                  <div className="mb-2 text-sm font-medium">
                    이렇게 조정할 수 있어요
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <AltCard
                      title="기한 연장"
                      value={`${result.alternatives.extendDeadline.months}개월`}
                      hint={
                        result.alternatives.extendDeadline.newTargetDate?.toLocaleDateString(
                          "ko-KR",
                        ) ?? "도달 불가"
                      }
                    />
                    <AltCard
                      title="목표 축소"
                      value={formatWonKorean(
                        result.alternatives.reduceTarget.achievableAmount,
                      )}
                      hint="현재 조건으로 달성 가능"
                    />
                    <AltCard
                      title="저축 증액"
                      value={`+${formatWon(
                        result.alternatives.increaseSaving.additionalPerMonth,
                      )}원`}
                      hint="매달 추가 필요"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="mt-6 w-full"
        size="lg"
        disabled={!result.valid || pending}
        onClick={handleSubmit}
      >
        {pending ? "저장 중…" : "시작하기"}
      </Button>
    </main>
  );
}

function FeasibilityBadge({
  grade,
}: {
  grade: keyof typeof FEASIBILITY_META;
}) {
  const meta = FEASIBILITY_META[grade];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function AltCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parseWon(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {parsed > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatWonKorean(parsed)}
          </span>
        )}
      </div>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
