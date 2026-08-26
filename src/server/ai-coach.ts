/**
 * AI 코칭 리포트 (SPEC §5·§9, CLAUDE.md 규칙 1·5·6).
 *
 * - core/ 엔진의 계산 결과를 구조화된 사실(JSON)로 정리해 Claude에 넘기고
 *   자연어 코칭만 받아온다. LLM은 산수를 하지 않는다.
 * - 비율은 여기서 이미 퍼센트로 변환해 전달한다(LLM 곱셈 오류 방지).
 * - generateFallbackSummary(): API 실패·오프라인·비용 절감 시 규칙 기반 요약.
 *   AI가 죽어도 앱은 돌아가야 한다.
 * - ANTHROPIC_API_KEY는 서버에서만. 이 모듈은 서버에서만 import된다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { DashboardData } from "@/lib/analysis";
import { formatWon } from "@/lib/format";

/** LLM에 넘기는 구조화된 사실. 모든 비율은 퍼센트(숫자)로 변환된 상태. */
export interface CoachFacts {
  goalTitle: string;
  months: number;
  requiredMonthlySavingWon: number;
  monthlySavingCapacityWon: number;
  monthlyShortfallWon: number;
  onTrack: boolean;
  feasibilityGrade: string;
  /** 필요 연수익률(%). 도달 불가면 null. */
  requiredReturnPct: number | null;
  reachableBySavingAlone: boolean;
  pace: {
    signal: string;
    projectedTotalWon: number;
    budgetWon: number;
    overBudget: boolean;
    overAmountWon: number;
  } | null;
  anomalies: { label: string; direction: "over" | "under"; deviationPct: number }[];
  investment: {
    profileLabel: string;
    allocation: { safe: number; bonds: number; stocks: number };
    emergencyFunded: boolean;
    monthlyInvestmentWon: number;
  } | null;
  preservation: { label: string; status: string; realReturnPct: number }[];
}

export type CoachResult = { text: string; source: "ai" | "fallback" };

/** 대시보드 계산 결과 → LLM용 사실 묶음. 비율은 전부 퍼센트로 변환. */
export function buildCoachFacts(data: DashboardData): CoachFacts {
  const f = data.diagnosis.feasibility;
  return {
    goalTitle: data.title,
    months: data.diagnosis.months,
    requiredMonthlySavingWon: data.diagnosis.requiredMonthlySaving,
    monthlySavingCapacityWon: data.diagnosis.monthlySavingCapacity,
    monthlyShortfallWon: data.diagnosis.monthlyShortfall,
    onTrack: data.diagnosis.onTrack,
    feasibilityGrade: f.grade,
    requiredReturnPct:
      f.requiredAnnualReturn === null
        ? null
        : Math.round(f.requiredAnnualReturn * 1000) / 10,
    reachableBySavingAlone: f.reachableBySavingAlone,
    pace: data.pace
      ? {
          signal: data.pace.signal,
          projectedTotalWon: data.pace.projectedTotal,
          budgetWon: data.pace.budget,
          overBudget: data.pace.overBudget,
          overAmountWon: data.pace.overAmount,
        }
      : null,
    anomalies: data.anomalies.map((a) => ({
      label: a.label,
      direction: a.deviationAmount > 0 ? "over" : "under",
      deviationPct: Math.abs(Math.round(a.deviationRatio * 100)),
    })),
    investment: data.investment
      ? {
          profileLabel: data.investment.profile.label,
          allocation: data.investment.profile.allocation,
          emergencyFunded: data.investment.emergencyFunded,
          monthlyInvestmentWon: data.investment.monthlyInvestment,
        }
      : null,
    preservation: data.preservation.map((p) => ({
      label: p.label,
      status: p.status,
      realReturnPct: Math.round(p.realReturn * 1000) / 10,
    })),
  };
}

const SYSTEM_PROMPT = `당신은 개인 자산관리 앱의 코치입니다. 사용자가 준 JSON 사실만 근거로 한국어 코칭 리포트를 작성하세요.

규칙:
- 주어진 숫자만 사용하세요. 직접 계산하지 마세요(퍼센트·금액은 이미 계산되어 있습니다).
- 특정 금융상품·종목·코인을 추천하지 마세요. 자산군(안전/채권/주식) 수준까지만 언급합니다.
- 투자를 언급하면 원금 손실 가능성을 함께 알리세요.
- 사용자를 다그치거나 비난하지 마세요. 비난 대신 다음에 할 행동을 제시하세요.
- 400자 이내, 3~4문장. 우선순위가 높은 것부터.
- 마크다운·머리말 없이 본문만 쓰세요.`;

/**
 * Claude로 코칭 리포트 생성. 키가 없거나 실패하면 규칙 기반 폴백.
 */
export async function generateCoaching(facts: CoachFacts): Promise<CoachResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: generateFallbackSummary(facts), source: "fallback" };
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { text: generateFallbackSummary(facts), source: "fallback" };
    return { text, source: "ai" };
  } catch {
    // AI가 죽어도 앱은 돌아가야 한다
    return { text: generateFallbackSummary(facts), source: "fallback" };
  }
}

/**
 * 규칙 기반 폴백 요약. LLM 없이도 동작한다.
 * 다그치지 않고 다음 행동을 제시하며, 특정 상품을 언급하지 않는다.
 */
export function generateFallbackSummary(facts: CoachFacts): string {
  const parts: string[] = [];

  // 1) 목표
  if (facts.onTrack) {
    parts.push(
      `현재 저축 페이스면 ${facts.months}개월 뒤 목표에 도달합니다. 지금 흐름을 유지하세요.`,
    );
  } else if (facts.reachableBySavingAlone) {
    parts.push("저축만으로 목표를 초과 달성할 수 있는 상태입니다.");
  } else if (facts.feasibilityGrade === "unrealistic") {
    const rr =
      facts.requiredReturnPct === null
        ? "필요 수익률이 매우 높아"
        : `필요 연수익률이 ${facts.requiredReturnPct}%로`;
    parts.push(
      `${rr} 현재 계획은 빠듯합니다. 기한을 늘리거나 목표를 조정하고, 월 저축을 ${formatWon(
        Math.max(0, facts.monthlyShortfallWon),
      )}원 늘리는 방법을 검토해 보세요.`,
    );
  } else {
    parts.push(
      `목표까지 ${facts.months}개월, 매달 ${formatWon(
        facts.requiredMonthlySavingWon,
      )}원이 필요합니다. 지금 여력으로 충분히 가능한 범위입니다.`,
    );
  }

  // 2) 이번 달 페이스
  if (facts.pace) {
    if (facts.pace.overBudget) {
      parts.push(
        `이번 달은 예산을 ${formatWon(
          facts.pace.overAmountWon,
        )}원 초과했습니다. 다음 달 예산에서 자연스럽게 조정하면 됩니다.`,
      );
    } else if (facts.pace.signal === "tight") {
      parts.push("이번 달 지출 페이스가 빠른 편이니 남은 기간 변동지출을 조금 줄여보세요.");
    } else if (facts.pace.signal === "surplus") {
      parts.push("이번 달은 여유가 있으니 남는 금액을 비상금이나 목표에 배분해 보세요.");
    }
  }

  // 3) 카테고리 알림
  const over = facts.anomalies.find((a) => a.direction === "over");
  if (over) {
    parts.push(`${over.label} 지출이 평소보다 ${over.deviationPct}% 많았습니다.`);
  }

  // 4) 투자 여력 (원금 손실 고지 포함)
  if (facts.investment) {
    if (!facts.investment.emergencyFunded) {
      parts.push("아직 비상금이 부족하니 투자보다 비상금 확보를 먼저 권합니다. 투자는 원금 손실 가능성이 있습니다.");
    } else if (facts.investment.monthlyInvestmentWon > 0) {
      parts.push(
        `비상금이 확보돼 매달 ${formatWon(
          facts.investment.monthlyInvestmentWon,
        )}원까지 ${facts.investment.profileLabel} 성향으로 투자 여력이 있습니다. 투자는 원금 손실 가능성이 있으니 자산군 수준에서 분산하세요.`,
      );
    }
  }

  // 400자 이내로 맞춘다
  let text = parts.join(" ");
  if (text.length > 400) text = text.slice(0, 399).trimEnd() + "…";
  return text;
}
